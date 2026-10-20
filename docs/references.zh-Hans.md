# 参考资料与建模选择

[English](references.md) · **简体中文**

实现根据公开规则与设施尺寸独立编写。以下版本构成项目记录的参考基线，检查日期为 2026-10-21。该日期表示本次检查时间，不保证此后没有规则修订。真实比赛以适用的现行规则与具体赛事规程为准。

## 世界田联资料

| 来源                                                                                                                                                                                                                                           | 相关章节                                     | 用途                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Competition and Technical Rules — 2026 Edition](https://worldathletics.org/download/download?filename=df5b2373-0019-4fab-9c1a-e8409ee99bef.pdf&urlslug=Competition%20and%20Technical%20Rules%20%E2%80%93%202026%20Edition)                    | TR14–17、TR19、TR22–24                       | 跑道计量、起跑与起跑器、分道与抢道线、终点对齐、跨栏、障碍赛、接力区和分道变体           |
| [2026 年 3 月修订](https://worldathletics.org/download/download?filename=1878ae9f-6548-458d-91be-9aa22fb1be13.pdf&urlslug=Competition%20and%20Technical%20Rule%20Amendments%20March%202026)                                                    | TR15.1、TR22.6、TR23.6                       | 起跑器表述、碰移栏架、已有水池与新建或改建水池的区别等相关修订；模型并未模拟全部规则程序 |
| [2026 年 7 月修订](https://worldathletics.org/download/download?filename=d345c869-4ecd-43b9-96d7-dfdf270d51a9.pdf&urlslug=Competition%20and%20Technical%20Rule%20Amendments%20July%202026)                                                     | CR32                                         | 已检查的 U20 5000 米竞走纪录修订，不属于当前项目目录                                     |
| [Track and Field Facilities Manual 2019，Chapters 1–3](https://worldathletics.org/download/download?filename=7d39b677-8043-45f4-89f4-6c8814023057.pdf&urlslug=Track%20and%20Field%20Facilities%20Manual%202019%20Edition%20-%20Chapters%201-3) | §2.2.1，印刷第 26–42 页；§2.2.4，第 46–51 页 | 标准跑道几何与计量、起跑线与分道线、抢道线构造、内侧水池布局                             |
| [400 米标准跑道标线图](https://worldathletics.org/download/download?filename=596848ce-6afe-4f00-8eb0-62a019ee215e.pdf&urlslug=Track%20and%20Field%20Facilities%20Manual%202019%20Edition%20-%20Marking%20Plan%20400m%20Standard%20Track)       | 图 2.2.1.6a 及标线表                         | 标线宽度、颜色、位置、接力区钩形标记、栏位标记、障碍定位块与图示交叉关系                 |

印刷页码可能与 PDF 阅读器页码不同。障碍赛设施主要参考图 2.2.4.1a、2.2.4.1d；障碍赛、接力主要分别参考 TR23、TR24。接力区边界按 TR24.3 指定的漆线边缘计量，而不是按漆线中心计量。

## 来源对应关系

| 组件                           | 规则或设施依据                               | 代码                                                                                       |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 项目目录与选定接力变体         | TR15–17、TR22–24                             | `src/track-data.js`、`src/track-app.js`                                                    |
| 椭圆跑道、分道、起跑线、抢道线 | 设施手册 §2.2.1；TR14、TR16、TR17.5          | `src/track-app.js`、`src/marking-precision.js`                                             |
| 终点与地面涂线                 | TR19.17；标线图及表格                        | `src/marking-precision.js`                                                                 |
| 内侧水池路线与栏架             | 设施手册 §2.2.4；TR23                        | `src/steeple-precision.js`、`src/steeple-kerb-fragment.js`                                 |
| 接力区与棒次顺序               | TR24；选用变体见[仿真模型](model.zh-Hans.md) | `src/relay-motion.js`、`src/relay-render.js`、`src/marking-precision.js`                   |
| 配速、平滑运动、队形、退场     | 实现约定，不是规则规定的比赛跑法             | `src/race-motion.js`、`src/course-motion.js`、`src/merge-motion.js`、`src/relay-motion.js` |

官方图纸中的数值也可能经过圆整。84.39 米直道与 36.80 米第一道计量半径的构造周长，比严格的 400 米约长 1.219 毫米。障碍赛示例同样存在圆整坐标，以及略有差异的圆整圈长。实现记录所选构造并协调这些数值，不声称具有更高的独立测绘精度。

部分尺寸是在规则范围内选定，另一些只服务于清晰绘图，尤其包括：

- 8 条分道、1.22 米道宽和 0.12 米路缘宽度是所选场地配置。
- 障碍赛支线铺装宽 3.8 米属于绘图选择。所引细图中的 3.800 表示水池纵向位置，不是强制铺装宽度。
- 4 × 1500 米完整交接站标线，是使用规则规定的 20 米区长进行的实现扩展。
- 漆线层次遵循所引标线图的图示惯例，不能将线条拓扑表述为通用的涂线先后规定。
- 统一 10 米/秒巡航、平滑起停曲线、队列间距、固定队伍次序与退场路线属于演示选择。
- 运动员符号、标签、器材风格、纹理和接力区高亮属于视觉辅助。

## 内场足球参考资料

足球场是场地背景。[FIFA 球场指南](https://inside.fifa.com/innovation/stadium-guidelines/technical-guidelines/stadiums-guidelines/pitch-dimensions-and-surrounding-areas)用于选择 105 米 × 68 米球场；[IFAB 第 1 章](https://www.theifab.com/laws/latest/the-field-of-play/)用于场地标线与球门尺寸。0.12 米线宽、2 米球门深度、0.22 米标点直径和草坪修剪纹理包含项目选择。IFAB 链接指向最新网页版本，项目没有附带固定版本的规则副本。模型不提供足球比赛功能。

## 使用与权利

世界田联、IFAB、FIFA 保留各自出版物的权利。上述链接用于说明参考来源；仓库的代码许可证不对这些文档重新授权。构建和运行模拟器不需要附带官方 PDF、复制的图纸或管理机构标识。

本项目不声称获得管理机构背书或场地认证。用于真实赛事前，应核对现行规则、获批场地配置和赛事具体规程。模型限制与研究用途见[仿真模型](model.zh-Hans.md)。
