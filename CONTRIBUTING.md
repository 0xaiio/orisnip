# 贡献指南

## 环境

- Node.js ≥ 20，npm ≥ 10
- 推荐 VS Code + ESLint/Prettier（本项目使用 TypeScript 严格模式作为主要静态检查）

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 全量测试
npm run build    # 类型检查 + 生产构建
```

## 目录约定

```
src/geometry/   纯几何，禁止 import React / DOM / window
src/game/       关卡与评分，可依赖 geometry
src/services/   副作用边界（网络、localStorage、canvas），必须处理失败
src/components/ 只做渲染与交互，不含几何推导
src/pages/      组合状态与组件
```

**硬规则**：`src/geometry` 下不得出现 `react`、`document`、`window`、`localStorage`。
这条规则保证了引擎可以在 Node 中直接测试，也是 `npm test` 能在 700 ms 内跑完的原因。

## 提交规范

使用 Conventional Commits：

```
feat(geometry): 支持对角折线
fix(cuts): 修正零长度判定使用绝对阈值的问题
docs(readme): 补充导出格式说明
test(levels): 覆盖初始解不通关的断言
```

一个提交只做一件事。涉及几何算法时，**测试必须与实现同一个提交**。

## 修改几何引擎的检查清单

几何是唯一"错了就全错"的部分。任何改动都必须走完这几步：

1. 先写出数学定义（可在 `docs/geometry.md` 里补一节），再写代码。
2. 至少补一个黄金用例和一个不变量断言。
3. 跑 `npm test`，确认 6 条不变量仍然成立：
   - 面片并集 = 原纸；
   - 变换是等距变换；
   - 面积不增；
   - 顶点不越界；
   - 同输入同输出；
   - 展开末帧 = 几何结果。
4. 若改动了 `Face`、`Paper` 或 `RigidTransform`，同步更新 `ARCHITECTURE.md` 第 3 节。

## 新增关卡

只改 `src/game/levels.ts`：

- `presetId` 必须是 `FOLD_PRESETS` 中已有的 id；
- `solution` 用 packet 坐标给出；
- `start` 必须**明显错误**（`levels.test.ts` 会断言它不得通关）；
- `tolerance` 按目标占比标定：目标面积小的关卡需要更严格的阈值。

目标图案会自动从 `solution` 生成，**不要**手写目标多边形。

## 代码风格

- 注释解释"为什么"，不复述"是什么"。几何相关的每个非显然步骤都要写清依据。
- 不使用 `any`；不确定的形状用 `unknown` + 收窄。
- 组件内不写几何计算；调用 `geometry/` 或 `services/`。
- 新增交互必须有键盘可达路径与 `aria-label`。

## 测试要求

| 改动 | 必须新增 |
|---|---|
| 几何算法 | 黄金用例 + 不变量断言 |
| 关卡数据 | 标准解通过 + 初始解不通过 |
| 服务层（存储/网络/导出） | 失败路径（损坏数据、异常、空结果） |
| 页面交互 | 手动跑 `tools/ui_check.py`，确认 0 控制台错误、0 横向溢出 |

## 隐私与安全

- 不收集任何个人信息，不上传作品。
- 模型调用只发送用户输入的那段文本，不附带作品库。
- 不把模型输出当作 HTML 或代码执行；一律经 `parseDesign` 校验后再进入引擎。
- 不引入未经许可核对的第三方图片、字体或代码。
