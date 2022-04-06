// import io from "socket.io";
// import * as uuid from "uuid";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var SubtitleGenerator = /** @class */ (function () {
    function SubtitleGenerator(room) {
        var _this = this;
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
            var isStreamSet_1 = false;
            room.localStreams.forEach(function (s) {
                if (s.ifAudio() && !s.ifScreen() && !isStreamSet_1) {
                    _this.setStream(s.audioStream.clone());
                    isStreamSet_1 = true;
                }
            });
        }
    }
    SubtitleGenerator.prototype.audioMutedEvent = function (data) {
        if (data.clientId === this.room.clientId) {
            this.pause();
        }
    };
    SubtitleGenerator.prototype.audioUnmutedEvent = function (data) {
        if (data.clientId === this.room.clientId) {
            this.resume();
        }
    };
    SubtitleGenerator.prototype.setStream = function (stream) {
        this.stream = stream;
    };
    SubtitleGenerator.prototype.startSocketStream = function () {
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
    };
    SubtitleGenerator.prototype.stopSocketStream = function () {
        this.socket.emit("end-stream", "");
    };
    SubtitleGenerator.prototype.createAudioProcessor = function (language) {
        var _this = this;
        if (language === void 0) { language = "en-IN"; }
        this.languageCode = language;
        this.startSocketStream();
        //init socket Google Speech Connection
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext({
            latencyHint: "interactive",
        });
        this.audioProcessor = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);
        this.audioProcessor.connect(this.audioContext.destination);
        this.audioContext.resume();
        this.inputStream = this.audioContext.createMediaStreamSource(this.stream);
        this.inputStream.connect(this.audioProcessor);
        this.audioProcessor.onaudioprocess = function (e) {
            _this.microphoneProcess(e);
        };
        this.setSilenceDetector(this.stream, this.audioContext);
    };
    SubtitleGenerator.prototype.microphoneProcess = function (e) {
        if (this.isRecording) {
            var left = e.inputBuffer.getChannelData(0);
            var left16 = SubtitleGenerator.convertFloat32ToInt16(left);
            this.socket.emit("mic-data", left16);
        }
    };
    SubtitleGenerator.convertFloat32ToInt16 = function (buffer) {
        var l = buffer.length;
        var buf = new Int16Array(l / 3);
        while (l--) {
            if (l % 3 === 0) {
                buf[l / 3] = buffer[l] * 0xffff;
            }
        }
        return buf.buffer;
    };
    SubtitleGenerator.prototype.getSocketURL = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) {
                        window.addEventListener("message", function socketUrlListener(e) {
                            var data;
                            if (typeof e.data === "string") {
                                data = JSON.parse(e.data);
                            }
                            else {
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
                    })];
            });
        });
    };
    SubtitleGenerator.prototype.connectSocket = function () {
        var _this = this;
        return this.getSocketURL().then(function (socketURL) {
            var socket = io(socketURL.host, {
                autoConnect: false,
                path: socketURL.path,
            });
            socket.connect();
            socket.on("connect", function () {
                _this.userId = socket.id;
                socket.emit("user", _this.user);
            });
            socket.on("transcript", function (data) {
                var text;
                if (_this.languageCode === "en-IN") {
                    text = data.toLowerCase();
                }
                else {
                    text = data;
                }
                // send local-subtitle event
                var messageOpt = {
                    enx_action: "signal",
                    enx_data: {
                        action: "local-subtitle",
                        payload: {
                            uuid: _this.currentGUID,
                            text: text,
                            user: _this.user,
                        },
                    },
                };
                _this.room.sendUserData(messageOpt, false, [_this.room.clientId]);
                var remainingUsers = Array.from(_this.room.userList.keys()).filter(function (id) { return id !== _this.room.clientId; });
                // send remote-subtitle event
                messageOpt = {
                    enx_action: "signal",
                    enx_data: {
                        action: "remote-subtitle",
                        payload: {
                            uuid: _this.currentGUID,
                            text: text,
                            user: _this.user,
                        },
                    },
                };
                _this.room.sendUserData(messageOpt, false, remainingUsers);
                console.log("".concat(_this.user, ": ").concat(text));
            });
            socket.on("transcript-finished", function () {
                var messageOpt = {
                    enx_action: "signal",
                    enx_data: {
                        action: "hide-subtitle",
                        payload: {
                            uuid: _this.currentGUID,
                        },
                    },
                };
                _this.room.sendUserData(messageOpt, false, [_this.room.clientId]);
                _this.currentGUID = uuid.v4();
            });
            socket.on("stream-error", function (error) {
                // We don't want to emit another end stream event
                _this.destroy();
                console.error(error);
            });
            socket.on("disconnect", function () {
                console.log("socket disconnected");
            });
            _this.socket = socket;
            return socketURL;
        });
    };
    SubtitleGenerator.prototype.stop = function () {
        this.isRecording = false;
        this.stopSocketStream();
        this.beforeDestroy();
    };
    SubtitleGenerator.prototype.start = function (stream) {
        var _this = this;
        if (stream) {
            this.setStream(stream);
        }
        this.connectSocket().then(function (socketURL) {
            _this.isRecording = true;
            _this.createAudioProcessor(socketURL.language || "en-IN");
        });
    };
    SubtitleGenerator.prototype.setSilenceDetector = function (stream) {
        var ctx = new AudioContext();
        var analyser = ctx.createAnalyser();
        var streamNode = ctx.createMediaStreamSource(stream);
        streamNode.connect(analyser);
        analyser.minDecibels = -80;
        var data = new Uint8Array(analyser.frequencyBinCount); // will hold our data
        var silence_start = performance.now();
        var triggered = false; // trigger only once per silence event
        var _that = this;
        function loop(time) {
            requestAnimationFrame(loop); // we'll loop every 60th of a second to check
            analyser.getByteFrequencyData(data); // get current data
            if (data.some(function (v) { return v; })) {
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
    };
    SubtitleGenerator.prototype.pause = function () {
        this.stopSocketStream();
        this.isRecording = false;
        this.stream.getTracks().forEach(function (t) { return (t.enabled = false); });
    };
    SubtitleGenerator.prototype.resume = function () {
        this.startSocketStream();
        this.isRecording = true;
        this.stream.getTracks().forEach(function (t) { return (t.enabled = true); });
    };
    SubtitleGenerator.prototype.beforeDestroy = function () {
        var _this = this;
        this.stopSocketStream();
        this.isRecording = false;
        // Clear the listeners (prevents issue if opening and closing repeatedly)
        this.socket.off("transcript");
        this.socket.off("stream-error");
        if (this.audioProcessor) {
            if (this.inputStream) {
                try {
                    this.inputStream.disconnect(this.audioProcessor);
                }
                catch (error) {
                    console.warn("Attempt to disconnect input failed.");
                }
            }
            this.audioProcessor.disconnect(this.audioContext.destination);
        }
        if (this.audioContext) {
            this.audioContext.close().then(function () {
                _this.inputStream = null;
                _this.audioProcessor = null;
                _this.audioContext = null;
            });
        }
    };
    SubtitleGenerator.prototype.destroy = function () {
        this.isRecording = false;
        this.beforeDestroy();
        this.stream.getTracks().forEach(function (t) { return t.stop(); });
        this.socket.disconnect();
        this.room.addEventListener("user-audio-muted", this.audioMutedEvent);
        this.room.addEventListener("user-audio-unmuted", this.audioUnmutedEvent);
    };
    return SubtitleGenerator;
}());
