# Contributing / 贡献指南

English and Simplified Chinese contributions are welcome. Issues and pull requests may use either language.

欢迎使用英文或简体中文提交问题和修改。

## Before You Start

Read the [development guide](../docs/development.md), [model assumptions](../docs/model.md), and [references](../docs/references.md). For a large feature, new competition format, or change to the motion policy, open an issue describing the intended behavior and evidence before investing in a broad rewrite. Small, reproducible fixes can go straight to a pull request.

Separate facility geometry, governing rules, chosen competition variants, and visualization policy. A rule correction needs an official edition and section; a performance change needs a reproducible browser scenario. Do not weaken geometric or motion tolerances merely to make a failing test pass.

## Development And Review

1. Fork the repository and create a focused branch from `main`.
2. Install with `npm ci`, run `npm run dev`, and edit source files in `src/`.
3. Add or update meaningful regressions. Keep shared test helpers independent of other test files and historical backups.
4. Run `npm run check`. Review the built `dist/index.html` in an actual browser for visible changes.
5. Update both interface languages and both documentation counterparts when applicable. Record user-visible changes in `CHANGELOG.md`.
6. Submit a pull request describing the problem, resulting behavior, rule/model implications, and exact validation performed. Include event, playback position, viewport, browser, and screenshots for rendering or input changes.

Keep pull requests limited to one coherent change and use Conventional Commit subjects, such as `fix(markings): preserve the shared relay boundary`. Do not add unrelated generated output, local configuration, or dependency upgrades. Build output belongs in `dist/` and is not committed.

## Evidence And Materials

For route or marking changes, provide the source edition and section alongside the implementation. State which parts are required by a rule and which are demonstration choices. For performance work, compare the same event, playback position, zoom, viewport, and browser version before and after the change; a faster Node test is not evidence of faster Safari rendering.

Only contribute material you have the right to redistribute. Do not upload official rule PDFs, copied marking-plan artwork, private screenshots, credentials, or machine-specific logs. Original source and application artwork use the code license; original documentation prose uses the documentation license. Existing notices must remain intact.

Vulnerabilities belong in [private security reports](SECURITY.md), not public issues.

## 开始前

请阅读[开发指南](../docs/development.zh-Hans.md)、[模型假设](../docs/model.zh-Hans.md)和[参考依据](../docs/references.zh-Hans.md)。大型功能、新赛制或运动策略变更，建议先通过 issue 说明预期行为及依据，再进行大范围重写；较小且可复现的修复可以直接提交 pull request。

明确区分设施几何、竞赛规则、选用赛制与可视化策略。规则修正应提供官方版本及章节，性能改动应提供可复现的浏览器场景。不要为了通过测试而直接放宽几何或运动误差要求。

## 开发与评审

1. Fork 仓库，从 `main` 创建聚焦单一改动的分支。
2. 使用 `npm ci` 安装，运行 `npm run dev`，修改 `src/` 中的源码。
3. 增补有意义的回归测试。共用测试工具应独立于其他测试文件和历史备份。
4. 运行 `npm run check`；可见改动还需在真实浏览器检查构建后的 `dist/index.html`。
5. 适用时同步两种界面语言及对应文档，将用户可感知的变更记录到 `CHANGELOG.md`。
6. Pull request 应说明问题、修改后行为、规则或模型影响及实际完成的验证；渲染或输入变更应提供项目、播放位置、视口、浏览器与截图。

每个 pull request 聚焦一个完整改动，提交标题采用 Conventional Commits，例如 `fix(markings): preserve the shared relay boundary`。不要夹带无关产物、本地配置或依赖升级。构建输出位于 `dist/`，不纳入提交。

## 依据与素材

修改路线或标线时，在实现旁记录依据版本与章节，说明哪些属于规则要求、哪些属于演示安排。性能优化应在相同项目、播放位置、缩放、视口与浏览器版本下比较；Node 测试更快不能证明 Safari 渲染更快。

仅提交有权再分发的素材，不上传官方规则 PDF、复制的标线图、私人截图、凭据或本机专属日志。原创源码及应用图形使用代码许可，原创文档正文使用文档许可，已有版权声明必须保留。

安全漏洞应按[安全政策](SECURITY.md)私下报告，不创建公开 issue。
