# Changelog

This project follows Semantic Versioning. Entries describe user-visible behavior, model changes, and development interfaces; the 0.x series does not promise a stable extension API.

本项目采用语义化版本。记录面向用户的行为、模型及开发接口变更；0.x 阶段不承诺稳定的扩展 API。

## Unreleased

### Added

- 0.25× and 8× playback speeds, extending the speed button to six multipliers.

### 新增

- 新增 0.25× 与 8× 播放倍数，倍速按钮支持六档循环切换。

### Fixed

- Selecting an athlete or team preserves the current zoom, including pending wheel input. Dragging leaves follow mode, clears the selection and pans from the latest position; wheel zoom and Space playback controls retain following.
- Relay following centres the visible current runner instead of the hidden baton position, including at extreme zoom and after handovers.
- Extreme-zoom window resizing preserves the camera centre and aspect ratio; subsequent wheel input respects the same zoom limits without jumping in the opposite direction.
- Escape still clears following when keyboard focus remains on a relay leg after its handover. Forward seeking after the finish no longer moves runners backward; backward seeking uses the displayed race progress.
- SVG font-stretch values are normalized before Canvas measurement, avoiding invalid-enum warnings and keeping equivalent font styles in the same metrics cache.
- Athlete labels remain visible in Safari at high zoom by avoiding the subpixel SVG text rendering hint that suppresses their glyphs.

### 修复

- 选中运动员或队伍时保留当前缩放，包括尚未绘制的滚轮输入。拖拽会退出跟随、清除选中并从最新位置平移；滚轮缩放与空格播放控制继续保持跟随。
- 接力跟随以当前运动员的可见圆点中心为准，修复极高倍率缩放及交接后的隐藏接力棒坐标偏移。
- 极限放大后调整窗口尺寸时，保持镜头中心与画幅比例；后续滚轮使用统一缩放边界，避免反向跳变。
- 接力交接后焦点仍在上一棒时，Escape 也能取消跟随；冲线后向前跳转不再让运动员倒退，向后跳转以显示进度为基准。
- 将 SVG 字体拉伸值转换为 Canvas 接受的格式，消除无效枚举警告，并让等价字体样式共用测量缓存。
- 避开 Safari 会漏画亚像素 SVG 字体的渲染设置，保证高倍率下运动员编号正常显示。

## 0.1.0 - 2026-10-21

### Added

- An eight-lane 400 m SVG track, permanent event markings, a steeplechase water-jump route, and an inner football pitch.
- Twenty-one track events, including 4 × 100 m, 4 × 200 m, 4 × 400 m, 4 × 800 m, and 4 × 1500 m relay formats.
- Shared cruising speed, smooth start/run-out motion, measured route distance, lane-break transitions, and continuous relay movement.
- Floating event and playback controls, camera pan/zoom, athlete/team following, timeline seeking, and four playback multipliers.
- English and Simplified-Chinese interfaces and documentation.
- A self-contained HTML build, local development/preview servers, portable regression tests, and continuous integration.
- Model assumptions, source references, extension guidance, contribution templates, and private vulnerability reporting guidance.

### Scope

- Preset routes and demonstration pacing support rule explanation and route analysis. Athlete physiology, race-result prediction, a tactical editor, road events, and mixed relays are not implemented.
- 4 × 200 m uses the all-lanes format. Other selected variants and visualization choices are documented in the model guide.

### 新增

- 八道 400 米 SVG 跑道、永久项目标线、障碍赛水池路线与内场足球场。
- 21 个径赛项目，包含 4 × 100 米、4 × 200 米、4 × 400 米、4 × 800 米、4 × 1500 米接力。
- 统一巡航速度、平滑起步及冲线后减速、实测路线距离、抢道过渡与连续接力运动。
- 悬浮项目及播放控件、视角平移缩放、运动员或队伍跟随、进度跳转与四档播放倍数。
- 英文与简体中文界面及文档。
- 自包含 HTML 构建、本地开发及预览服务器、可移植回归测试与持续集成。
- 模型假设、参考依据、扩展指南、贡献模板及私下漏洞报告说明。

### 范围

- 预设路线及演示配速用于规则解释与路线分析；尚未实现运动员生理模型、赛果预测、战术编辑器、公路项目及混合接力。
- 4 × 200 米采用全程分道赛制；其他选用变体及可视化安排见模型文档。
