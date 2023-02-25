## Vue Player
 - require Vue.js (v3)
 - require Bulma.css
 - support：m3u8、mp3/acc/ogg (audio h5)、mpd

## English 
Very little code, very easy for front-end developers to customize the player to adapt to their own projects.
Please use this player with caution in a production environment until you understand it yourself.

## 说明
非常少的代码，非常易于前端开发者自定义播放器用来适配自己的项目。
本播放器请谨慎用于生产环境，直到你自己了解了它。

## html
```html
<div id="player"></div>
```
## URL
```JavaScript
	let urls = [
		{
			"type": "m3u8",
			"url": "http://a.files.bbci.co.uk/media/live/manifesto/audio/simulcast/hls/nonuk/sbr_low/ak/bbc_world_service.m3u8",
			"cors": 1,
		},
		{
			"type": "m3u8",
			"url": "https://as-hls-ww-live.akamaized.net/pool_904/live/ww/bbc_radio_one/bbc_radio_one.isml/bbc_radio_one-audio%3d96000.norewind.m3u8",
			"cors": 1
		},
		{
			"type": "mp3",
			"url": "https://14033.live.streamtheworld.com/YES933_PREM.aac",
			"cors": ""
		}
	];

	let config = {
		"container": "#player",
		"urls": urls,
		"volume": 0.5,
		"autoplay": true,
		"is_audio": true,
		"is_live": true,
		"url_start": 0,
	};
	build_aliplayer(config);
```