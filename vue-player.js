/**
 * 自研（皮肤+整合）播放器
 * 
 * 依赖：
 * - Vue.js（require）
 * - bulma.css
 * - hls.js（.m3u8）
 * - dashjs（.mpd）
 *
 * @link https://developer.mozilla.org/zh-CN/docs/Learn/HTML/Multimedia_and_embedding/Video_and_audio_content
 * @link https://github.com/video-dev/hls.js/blob/master/docs/API.md
 * @link https://cdn.dashjs.org/latest/jsdoc/index.html
 * @link https://developer.mozilla.org/zh-CN/docs/Web/API/HTMLMediaElement/load
 * 
 * 已解决
 * - hls
 * - mp3
 * 待解决
 * - 进度拖放
 * 
 * Debug
 * - {{error_count}} {{url}}
 */

// 定义全局 hls 实例，以便于在切换时播放器时销毁，停止加载流媒体
let hls = null;

function vue_player(config) {
    let defaults = {
        "container": "",
        "urls": "",
        "volume": 0.5,
        "autoplay": true,
        "is_audio": true,
        "is_live": true,
        "url_start": 0,
        "callback": false, // 播放构建后的回调函数，将回传本 vue 实例 (this)
        "errorback": false, // 播放出错时的回调函数，将回传本 vue 实例 (this)
    };
    config = Object.assign(defaults, config);

    let element = `
<div id="vue-player">
	<div class="columns is-marginless is-multiline is-mobile is-align-items-center">
		<div id="media-canvas" class="column is-full mb-5" v-show="!config.is_audio">
			<audio v-if="config.is_audio" id="audio-el" class="is-hidden"></audio>
			<video v-else id="video-el"></video>
		</div>
		<div id="seek-slider" class="column is-full mb-3 pt-3" v-show="!config.is_live">
			<input type="range" max="0" value="0">
		</div>
		<div id="play-button-wrap" class="column is-1">
			<button @click="toggle()" class='play-button' :class="'playing' == status ? 'paused' : ''"></button>
		</div>
		<div id="status-bar" class="column is-1">
			<div class="status loading" v-show="status_show('loading')"></div>
			<div class="music-bar" :class="get_status()" v-show="music_show()">
				<span class="bar n1"></span>
				<span class="bar n2"></span>
				<span class="bar n3"></span>
				<span class="bar n4"></span>
			</div>
			<span v-show="status_show('error')"><i>Error !</i></span>
		</div>
		<div id="info-bar" class="column is-4 is-justify-content-left">
			<a @click="fullscreen()" class="full-screen mr-5" v-show="!config.is_audio"></a>
            <span v-show="loading_time">……</span>
            <div v-show="msg && !loading_time" class="is-size-7" v-html="msg"></div>
		</div>
		<div id="tools-bar" class="column is-auto is-justify-content-right"> 
            <div id="line-switcher" class="is-size-7" style="text-shadow:none;color:#EEE;">
                <div style="text-align:left;position: absolute;top:100%;z-index:99;background:#CF8E8A;padding:10px;border-radius:0 0 3px 3px;" :class="show_line ? '' : 'is-hidden' ">
                    <ul>
                        <li v-for="(stream, index) in config.urls"><a @click="switch_stream(index)">L{{(index + 1) + '. ' + stream.type}}</a></li>
                    </ul>
                </div>
                <a @click="line_show()"><span style="user-select:none;padding:3px 10px;border-radius:3px;box-shadow:0px 0px 1px #500;">Line : {{url_index + 1}}</span></a>
            </div>
            <input id="volume-bar" class="is-hidden-touch ml-3" type="range" max="1" step="0.001" v-model="volume">
		</div>
	</div>
</div>`;

    let app_option = {
        template: element,
        data() {
            return {
                "config": config,
                "player": null,
                "volume": config.volume,
                "autoplay": config.autoplay,
                "url": "",
                "url_index": config.url_start,
                "cors": false,
                "status": "",
                "canplay": false, //无法自动播放的情况下，status 将停留在loading
                "monitor": null,
                "current_time": 0,
                "duration": 0,
                "error_count": 0,
                "loading_time": 0,
                "loading_interval": null,
                "tryagin_timer": null,
                "show_line": false,
                "msg": "",
            };
        },
        methods: {
            build: function () {
                // 检查是否全部为空
                let empty = !config.urls.some((el) => el.url.length > 0);
                if (empty) {
                    return;
                }

                let el_id = config.is_audio ? "audio-el" : "video-el";
                this.player = document.getElementById(el_id);

                this.init_meida();
                this.build_player();

                // 切换 stream 或重新载入 urls 均执行回调
                let callback = config.callback;
                if ("function" == typeof callback) {
                    callback(this);
                }
            },
            require_hls: function () {
                if (this.is_app_safari()) {
                    return false;
                }

                return this.url.includes(".m3u8");
            },
            require_dash: function () {
                return this.url.includes(".mpd");
            },
            is_app_safari: function () {
                const platformExpression = /Mac|iPhone|iPod|iPad/i;
                const rejectedExpression = /Chrome|Android|CriOS|FxiOS|EdgiOS/i;
                const expectedExpression = /Safari/i;

                const agent = navigator.userAgent;
                if (rejectedExpression.test(agent)) {
                    return false;
                }
                return platformExpression.test(agent) && expectedExpression.test(agent);
            },
            build_player: async function () {
                if (this.cors < 0) {
                    if (this.is_mobile()) {
                        return this.build_h5_player();
                    } else {
                        this.msg = "Error on line " + (this.url_index + 1);
                        if (this.url_index < config.urls.length - 1) {
                            this.url_index++;
                            this.build();
                        }
                        return;
                    }
                }

                // url = url + "?ran=" + Math.random();
                if (this.require_hls()) {
                    if ("undefined" == typeof Hls) {
                        await this.load_script("https://lf3-cdn-tos.bytecdntp.com/cdn/expire-1-M/hls.js/1.1.5/hls.min.js");
                    }
                    return this.build_hls_player();
                }

                if (this.require_dash()) {
                    if ("undefined" == typeof dashjs) {
                        await this.load_script("https://cdn.dashjs.org/v4.6.0/dash.all.min.js");
                    }
                    return this.build_dash_player();
                }

                this.build_h5_player();
            },
            toggle: function () {
                if ("error" == this.status || "loading" == this.status) {
                    this.error_count = 0;
                    return this.tryagin();
                }
                if ("playing" != this.status) {
                    this.player.play();
                } else {
                    this.player.pause();
                }
            },
            // 封装简化后的状态值
            get_status: function () {
                if ("loading" == this.status && this.canplay) {
                    return "canplay";
                }

                if (["init", "loading", "waiting"].includes(this.status)) {
                    return "loading";
                }

                return this.status;
            },
            status_show: function (status) {
                return (status == this.get_status());
            },
            music_show: function () {
                return ["playing", "pause", "canplay", "ready", "play"].includes(this.get_status());
            },
            line_show: function () {
                this.show_line = !this.show_line;
            },
            fullscreen: function () {
                this.player.requestFullscreen();
            },
            build_h5_player: function () {
                this.player.src = this.url;
                this.player.autoplay = this.autoplay;
                this.player.volume = this.volume;
                this.monitor_h5(this.player);
                if (this.autoplay) {
                    this.player.play();
                }
            },
            monitor_h5: function (h5_player) {
                // 当currentTime更新时会触发timeupdate事件
                h5_player.ontimeupdate = () => {
                    if (this.error_count > 0 && h5_player.currentTime > 0) {
                        this.error_count = 0;
                    }
                    if ("playing" != this.status) {
                        this.status = "playing";
                    }
                };

                // 加载 or 缓冲（缓冲计时开始）
                h5_player.onloadstart = h5_player.onloadeddata = h5_player.onloadedmetadata = h5_player.onwaiting = () => {
                    this.status = "loading";

                    if (!this.loading_interval) {
                        this.loading_interval = setInterval(() => {
                            this.loading_time++;
                        }, 1000);
                    }
                };

                // 直播中断作为错误处理
                h5_player.onended = () => {
                    if (config.is_live) {
                        this.handle_error();
                    } else {
                        this.status = "pause";
                        this.stop_loading_monitor();
                    }
                };

                // 暂停 or 准备就绪 or 播放结束（缓冲计时结束）
                h5_player.onpause = h5_player.oncanplay = () => {
                    this.status = "pause";
                    this.stop_loading_monitor();
                };

                // Hls已有错误处理方法
                if (hls && hls.media) {
                    return;
                }

                // 播放出错（缓冲计时结束）
                h5_player.onerror = () => {
                    this.handle_error();
                };
            },
            build_hls_player: function () {
                hls = new Hls();
                if (!Hls.isSupported()) {
                    this.build_h5_player();
                    return;
                }

                this.player.load();
                hls.loadSource(this.url);
                hls.attachMedia(this.player);

                this.player.autoplay = this.autoplay;
                this.player.volume = this.volume;
                this.monitor_h5(this.player);
                if (this.autoplay) {
                    this.player.play();
                }

                /**
                 * @link https://github.com/video-dev/hls.js/blob/master/docs/API.md#fifth-step-error-handling
                 * 错误处理 
                 */
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (!data.fatal) {
                        return;
                    }

                    this.handle_error();

                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            // try to recover network error
                            console.log('fatal network error encountered, try to recover');
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.log('fatal media error encountered, try to recover');
                            hls.recoverMediaError();
                            break;
                        default:
                            // cannot recover
                            console.log(data.details);
                            hls.destroy();
                            break;
                    }
                });
            },
            /**
             * @link http://cdn.dashjs.org/latest/jsdoc/module-MediaPlayer.html#initialize__anchor
             */
            build_dash_player: function () {
                this.player.load();
                let player = dashjs.MediaPlayer().create();
                player.initialize(this.player, this.url, this.autoplay);
                player.setVolume(this.volume);
                this.monitor_h5(this.player);

                player.on('error', (e) => {
                    this.handle_error();
                    // if (e.error === 'download') { }
                });
            },
            handle_error: function () {
                this.stop_loading_monitor();
                this.error_count++;
                this.status = "error";

                // Error 外部回调
                let errorback = config.errorback;
                if ("function" == typeof errorback) {
                    errorback(this);
                }

                // 所有 url 均已达到最大试错
                if (this.error_count >= 3 && this.url_index >= config.urls.length - 1) {
                    return;
                }

                // 重试当前 url
                if (this.error_count < 3) {
                    this.tryagin();
                    return;
                }

                // 切换下一个 url
                if (this.url_index < config.urls.length - 1) {
                    clearTimeout(this.tryagin_timer);
                    this.error_count = 0;
                    this.url_index++
                    this.build();
                }
            },
            init_meida: function () {
                let media = config.urls[this.url_index];
                this.url = media.url;
                this.cors = media.cors || 1;

                // 销毁可能存在的 hls 实例
                if (hls) {
                    hls.destroy();
                }
            },
            tryagin: function () {
                this.tryagin_timer = setTimeout(() => {
                    this.status = "loading";
                    if (hls) {
                        hls.loadSource(this.url);
                    } else {
                        this.player.src = this.url;
                    }
                    this.player.load();
                    this.player.play();
                }, this.error_count * 1000);
            },
            stop_loading_monitor: function () {
                clearInterval(this.loading_interval);
                this.loading_time = 0;
            },
            switch_stream: function (index) {
                this.line_show();
                this.url_index = index;
                this.init_meida;
                this.build();
            },
            // 载入全新的 URLs 组
            load_urls: function (urls, url_index) {
                this.url_index = url_index;
                this.config.urls = urls;
                this.build();
            },
            //判断是否为移动端
            is_mobile: function () {
                if (navigator.userAgent.match(/(iPhone|iPad|iPod|Android|ios|App\/)/i)) {
                    return true;
                } else {
                    return false;
                }
            },
            load_script: function (url) {
                return new Promise(function (resolve, reject) {
                    let script = document.createElement('script');
                    script.type = 'text/javascript';
                    script.src = url;
                    document.head.appendChild(script);
                    script.onload = () => {
                        resolve(true);
                    };
                });
            }
        },
        // created: function () { },
        mounted: function () {
            this.build();
        },
        // computed: {},
        watch: {
            // 音量
            volume: function (v) {
                this.player.volume = v;
                localStorage.setItem("wndt_volume", v);
            },
            // 缓冲时间过长：重试
            loading_time: function (time) {
                if (time >= 30) {
                    this.loading_time = 0;
                    this.tryagin();
                }
            }
        }
    };

    Vue.createApp(app_option).mount(config.container);
}