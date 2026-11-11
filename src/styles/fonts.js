/**
 * 本地打包的拉丁字体（离线 / 国内网络可用，不再请求 Google Fonts）。
 * 中文一律走系统字体栈（PingFang / 微软雅黑），见各主题 tokens.css。
 * 只引入 latin 子集与实际用到的字重，控制安装包体积。
 */
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-700.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
