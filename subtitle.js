// import io from "socket.io";
// import * as uuid from "uuid";

class SubtitleGenerator {
  constructor(room) {
    this.room = room;
    this.user = room.me.name;
    this.stream = null;
    this.bufferSize = 2048;
    this.audioContext = null;
    this.audioProcessor = null;
    this.inputStream = null;
    // eslint-disable-next-line
    this.currentGUID = uuid.v4();
    this.audioMutedEvent = this.audioMutedEvent.bind(this);
    this.audioUnmutedEvent = this.audioUnmutedEvent.bind(this);
    room.addEventListener("user-audio-muted", this.audioMutedEvent);
    room.addEventListener("user-audio-unmuted", this.audioUnmutedEvent);

    if (room.localStreams.size() > 0) {
      let isStreamSet = false;
      room.localStreams.forEach((s) => {
        if (s.ifAudio() && !s.ifScreen() && !isStreamSet) {
          this.setStream(s.audioStream.clone());
          isStreamSet = true;
        }
      });
    }
  }

  audioMutedEvent(data) {
    if (data.clientId === this.room.clientId) {
      this.pause();
    }
  }

  audioUnmutedEvent(data) {
    if (data.clientId === this.room.clientId) {
      this.resume();
    }
  }

  setStream(stream) {
    this.stream = stream;
  }

  startSocketStream() {
    this.socket.emit("start-stream", {
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: this.languageCode,
        profanityFilter: false,
        enableWordTimeOffsets: true,
      },
      interimResults: true, // If you want interim results, set this to true
    });
  }

  stopSocketStream() {
    this.socket.emit("end-stream", "");
  }

  createAudioProcessor(language = "en-IN") {
    this.languageCode = language;
    this.startSocketStream();
    //init socket Google Speech Connection
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext({
      latencyHint: "interactive",
    });
    this.audioProcessor = this.audioContext.createScriptProcessor(
      this.bufferSize,
      1,
      1
    );
    this.audioProcessor.connect(this.audioContext.destination);
    this.audioContext.resume();

    this.inputStream = this.audioContext.createMediaStreamSource(this.stream);
    this.inputStream.connect(this.audioProcessor);

    this.audioProcessor.onaudioprocess = (e) => {
      this.microphoneProcess(e);
    };

    this.setSilenceDetector(this.stream, this.audioContext);
  }

  microphoneProcess(e) {
    if (this.isRecording) {
      var left = e.inputBuffer.getChannelData(0);
      var left16 = SubtitleGenerator.convertFloat32ToInt16(left);
      this.socket.emit("mic-data", left16);
    }
  }

  static convertFloat32ToInt16(buffer) {
    let l = buffer.length;
    let buf = new Int16Array(l / 3);

    while (l--) {
      if (l % 3 === 0) {
        buf[l / 3] = buffer[l] * 0xffff;
      }
    }
    return buf.buffer;
  }

  async getSocketURL() {
    return new Promise((resolve) => {
      window.addEventListener("message", function socketUrlListener(e) {
        let data;
        if (typeof e.data === "string") {
          data = JSON.parse(e.data);
        } else {
          data = e;
        }
        if (data && data.data.socket) {
          resolve({
            host: data.data.socket.host,
            path: data.data.socket.path,
            language: data.data.socket.language,
          });
          window.removeEventListener("message", socketUrlListener);
        }
      });
      window.parent.postMessage({ socketUrl: true }, "*");
    });
  }

  connectSocket() {
    return this.getSocketURL().then((socketURL) => {
      const socket = io(socketURL.host, {
        autoConnect: false,
        path: socketURL.path,
      });
      socket.connect();
      socket.on("connect", () => {
        this.userId = socket.id;
        socket.emit("user", this.user);
      });
      socket.on("transcript", (data) => {
        let text;
        if (this.languageCode === "en-IN") {
          text = data.toLowerCase();
        } else {
          text = data;
        }
        // send local-subtitle event
        let messageOpt = {
          enx_action: "signal",
          enx_data: {
            action: "local-subtitle",
            payload: {
              uuid: this.currentGUID,
              text: text,
              user: this.user,
            },
          },
        };
        this.room.sendUserData(messageOpt, false, [this.room.clientId]);
        const remainingUsers = Array.from(this.room.userList.keys()).filter(
          (id) => id !== this.room.clientId
        );
        // send remote-subtitle event
        messageOpt = {
          enx_action: "signal",
          enx_data: {
            action: "remote-subtitle",
            payload: {
              uuid: this.currentGUID,
              text: text,
              user: this.user,
            },
          },
        };
        this.room.sendUserData(messageOpt, false, remainingUsers);
        console.log(`${this.user}: ${text}`);
      });
      socket.on("transcript-finished", () => {
        let messageOpt = {
          enx_action: "signal",
          enx_data: {
            action: "hide-subtitle",
            payload: {
              uuid: this.currentGUID,
            },
          },
        };
        this.room.sendUserData(messageOpt, false, [this.room.clientId]);
        this.currentGUID = uuid.v4();
      });
      socket.on("stream-error", (error) => {
        // We don't want to emit another end stream event
        this.destroy();
        console.error(error);
      });
      socket.on("disconnect", () => {
        console.log("socket disconnected");
      });

      this.socket = socket;

      return socketURL;
    });
  }

  stop() {
    this.isRecording = false;
    this.stopSocketStream();
    this.beforeDestroy();
  }

  start(stream) {
    if (stream) {
      this.setStream(stream);
    }
    this.connectSocket().then((socketURL) => {
      this.isRecording = true;
      this.createAudioProcessor(socketURL.language || "en-IN");
    });
  }

  setSilenceDetector(stream) {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    const streamNode = ctx.createMediaStreamSource(stream);
    streamNode.connect(analyser);
    analyser.minDecibels = -80;

    const data = new Uint8Array(analyser.frequencyBinCount); // will hold our data
    let silence_start = performance.now();
    let triggered = false; // trigger only once per silence event

    const _that = this;

    function loop(time) {
      requestAnimationFrame(loop); // we'll loop every 60th of a second to check
      analyser.getByteFrequencyData(data); // get current data
      if (data.some((v) => v)) {
        // if there is data above the given db limit
        if (triggered) {
          triggered = false;
          _that.startSocketStream();
        }
        silence_start = time; // set it to now
      }
      if (!triggered && time - silence_start > 500) {
        _that.stopSocketStream();
        triggered = true;
      }
    }
    loop();
  }

  pause() {
    this.stopSocketStream();
    this.isRecording = false;
    this.stream.getTracks().forEach((t) => (t.enabled = false));
  }

  resume() {
    this.startSocketStream();
    this.isRecording = true;
    this.stream.getTracks().forEach((t) => (t.enabled = true));
  }

  beforeDestroy() {
    this.stopSocketStream();
    this.isRecording = false;
    // Clear the listeners (prevents issue if opening and closing repeatedly)
    this.socket.off("transcript");
    this.socket.off("stream-error");
    if (this.audioProcessor) {
      if (this.inputStream) {
        try {
          this.inputStream.disconnect(this.audioProcessor);
        } catch (error) {
          console.warn("Attempt to disconnect input failed.");
        }
      }
      this.audioProcessor.disconnect(this.audioContext.destination);
    }
    if (this.audioContext) {
      this.audioContext.close().then(() => {
        this.inputStream = null;
        this.audioProcessor = null;
        this.audioContext = null;
      });
    }
  }

  destroy() {
    this.isRecording = false;
    this.beforeDestroy();
    this.stream.getTracks().forEach((t) => t.stop());
    this.socket.disconnect();
    this.room.addEventListener("user-audio-muted", this.audioMutedEvent);
    this.room.addEventListener("user-audio-unmuted", this.audioUnmutedEvent);
  }
}
