# Renderer Skill Contract

## 定义

Renderer Skill 用于将标准产物渲染为 HTML、Markdown、PDF 或其他展示格式。

## 必须遵守

- Renderer 只改变展示形式，不改变语义。
- 不得删除 Schema 必填章节。
- 不得合并关键字段。
- 不得自动补充未确认业务内容。
- 不得为了排版省略风险、异常、边界或测试章节。

## 输入

- Standard Artifact
- Target Format
- Style Requirements

## 输出

- Rendered Document

## 副作用

允许写文档文件，前提是 Skill Contract 中声明目标路径。

## 阻塞条件

- 输入产物不符合 Schema。
- 缺少必填章节。
- 用户要求的展示格式会导致语义丢失。

