# Security Policy / 安全政策

## Supported Versions

Security fixes target the latest revision on `main`. Older snapshots are not maintained separately; no long-term support schedule is currently offered.

This is a static, client-side application. It has no account system, hosted API, or backend in this repository. The local development and preview servers bind to the loopback interface by default and are intended for local use. Reports may still concern unsafe file serving, dependency tooling, or handling of untrusted data introduced by an extension.

## Reporting A Vulnerability

Use [Report a vulnerability](https://github.com/lailai0916/athletics-simulator/security/advisories/new) in this repository's Security tab. Do not disclose exploitable details in a public issue or pull request before a fix is available.

Include the affected commit or version, environment, reproduction steps, expected impact, and a minimal proof of concept. Remove credentials and personal information. A suggested mitigation is helpful but not required. Reports are reviewed as maintainer availability permits; this project does not promise a fixed response deadline.

Rule interpretation, simulation accuracy, and rendering defects should use the ordinary issue templates unless they also create a security vulnerability.

## 支持范围

安全修复面向 `main` 分支的最新版本，不单独维护旧快照，目前不提供长期支持时间表。

本项目是静态前端应用，仓库没有账户系统、托管 API 或后端。本地开发与预览服务器默认仅绑定回环地址，供本地使用。安全报告仍可涉及不安全的文件服务、开发依赖工具，或扩展引入的不可信数据处理问题。

## 漏洞报告

请在仓库 Security 页面使用 [Report a vulnerability](https://github.com/lailai0916/athletics-simulator/security/advisories/new) 私下提交。修复完成前，不要在公开 issue 或 pull request 中披露可利用细节。

请提供受影响提交或版本、环境、复现步骤、预期影响与最小验证示例，移除凭据及个人信息。可以提供缓解建议，但并非必须。维护者按可用时间处理报告，本项目不承诺固定回复时限。

规则解释、模拟精度和渲染缺陷通常使用普通问题模板；若同时造成安全漏洞，再使用私下报告。
