# 几何模型 · 数学定义与实现对照

本文档把《一刀万象》用到的数学写清楚，并与代码逐条对应。
它是"为什么结果是正确的"这一问题的唯一权威答案。

---

## 1. 基本对象

设初始纸张是平面上的一个简单多边形区域

$$
P \subset \mathbb{R}^2,\qquad P = [-a,a]\times[-a,a],\ a=1
$$

在实现中 `a = 1`，于是纸面积 $\mathrm{area}(P) = 4$。

经过 $n$ 次折叠后，$P$ 被划分为若干互不重叠的面片

$$
P = P_1 \cup P_2 \cup \cdots \cup P_m
$$

每个面片 $P_i$ 附带一个从**纸面坐标**到**纸包坐标**的等距变换

$$
T_i(\mathbf{p}) = M_i\mathbf{p} + \mathbf{t}_i,\qquad
M_i \in O(2),\ \det M_i = \pm 1
$$

代码对应：`src/geometry/types.ts` 的 `Face` 与 `RigidTransform`。

> **不变量 I1**：$\bigcup_i P_i = P$，且任意两片内部不相交。
> **不变量 I2**：每个 $M_i$ 正交（列向量单位正交）。
>
> 二者都能被 `geometry.test.ts > faces always tile the sheet exactly` 与
> `every face transform is an isometry` 直接验证。

---

## 2. 折叠

### 2.1 反射

沿直线 $L:\ \mathbf{n}\cdot\mathbf{p} = c$（$\|\mathbf{n}\|=1$）的反射为

$$
R_L(\mathbf{p}) = \mathbf{p} - 2\big(\mathbf{n}\cdot\mathbf{p} - c\big)\mathbf{n}
        = \underbrace{(I - 2\mathbf{n}\mathbf{n}^{\top})}_{M}\mathbf{p} + \underbrace{2c\,\mathbf{n}}_{\mathbf{t}}
$$

代码：`transforms.ts > reflection(line)`。

### 2.2 一次折叠

给定折痕 $L$ 与"被掀起的一侧" $S^-$：

$$
P_i^{\text{stay}} = P_i \cap S^+,\qquad P_i^{\text{move}} = P_i \cap S^-
$$

- 静止部分：$T_i$ 不变；
- 移动部分：$T_i' = R_L \circ T_i$，而 **$P_i^{\text{move}}$ 本身不变**。

最后一条是整个引擎的关键：纸片的物理位置不因为折叠而改变，改变的只是它在纸包里的像。
如果用 $T_i'^{-1}$ 去反推纸面区域，得到的是镜像后的错误区域。

$$
T_i'^{-1}\big(T_i'(P_i)\big) = P_i
\quad\text{但}\quad
T_i'^{-1}\big(R_L(T_i(P_i))\big) = R_L^{-1}(P_i) \neq P_i
$$

代码：`folds.ts > applyFold`。测试：
`unfold stages form a chain that ends flat`、`transformAtStage agrees with the stored transform`。

### 2.3 层序

掀起的一叠纸落下后位于静止部分之上，且内部顺序反转：

```
faces' = [ 静止组(原序) , 反转(移动组) ]
```

代码：`applyFold` 末尾的 `[...stays, ...moves.reverse()]`。

---

## 3. 切割

"一刀"= 一个半平面。设切口所在直线 $\ell$、保留侧符号 $\sigma \in \{+1,-1\}$：

$$
H = \{\,\mathbf{p} : \sigma\,(\mathbf{n}_\ell \cdot (\mathbf{p} - \mathbf{p}_\ell)) \ge 0\,\}
$$

每个面片裁剪为

$$
P_i' = T_i^{-1}\big(T_i(P_i) \cap H\big)
$$

代码：`cuts.ts > applyCut`，底层是 `polygons.ts > clipHalfPlane`
（Sutherland–Hodgman，对凸多边形精确）。

### 3.1 退化情形

| 情形 | 判据 | 处理 |
|---|---|---|
| 零长度切线 | $\lVert b-a\rVert < 10^{-9}$ | 拒绝，`zero-length` |
| 太短 | $\lVert b-a\rVert < 0.02$ | 拒绝，`too-short` |
| 不与纸相交 | 被剪掉的面积 $< 10^{-9}$ | 拒绝，`no-intersection` |
| 切掉整张纸 | 保留面积 $< 10^{-9}$ | 拒绝，`empty-result` |

代码：`cuts.ts > validateCut`。

---

## 4. 展开

$$
A = \bigcup_{i=1}^{m} P_i'
$$

$A$ 可能非凸、断开、含孔洞。用布尔并计算（Martinez–Rueda 类算法），
孔洞由环的奇偶性表达。

$$
\mathrm{area}(A) = \sum_{\text{外环}} \left|\tfrac12\oint (x\,dy - y\,dx)\right|
                - \sum_{\text{内环}} \left|\tfrac12\oint (x\,dy - y\,dx)\right|
$$

代码：`unfold.ts > unfold`、`polygons.ts > unionRegions / cleanPolygon`。

函数 `cleanPolygon` 会丢弃面积小于 $10^{-9}$ 的环——这些是浮点误差产生的针状碎片，
不是真实的纸。

---

## 5. 黄金用例：一刀成菱

取纸 $P=[-1,1]^2$，先沿 $x=0$ 把左半折到右半，再沿 $y=0$ 把下半折到上半。
此时纸包为 $[0,1]^2$，且

$$
u = |x|,\qquad v = |y|
$$

在纸包内沿直线

$$
u + v = d,\qquad 0<d<1
$$

剪掉靠近原点的一侧（保留 $u+v \ge d$）。四层纸各被剪掉一个直角边为 $d$ 的等腰直角三角形，
总剪掉面积

$$
4 \cdot \frac{d^2}{2} = 2d^2
$$

展开后，被剪掉的点集恰为

$$
\{\,(x,y) : |x| + |y| < d \,\}
$$

这是一个以 $(\pm d, 0), (0, \pm d)$ 为顶点的菱形。剩余纸张为

$$
P \setminus \{\,(x,y): |x|+|y| < d\,\},\qquad
\mathrm{area} = 4 - 2d^2
$$

**验证**：`geometry.test.ts > 04 — two orthogonal folds + corner triangle cut => diamond hole`

```
expect(result.area).toBeCloseTo(4 - 2 * d * d, 8)
expect(iou(result.region, expected)).toBeCloseTo(1, 8)
expect(symmetricDifferenceArea(result.region, expected)).toBeLessThan(1e-9)
expect(result.holeCount).toBe(1)
```

并额外断言菱形内部点不在纸上、菱形尖端之外的点仍在纸上。

---

## 6. 逐层展开动画的数学

折叠可以看作"绕折痕旋转 180°"在平面上的投影。取参数 $\theta \in [0,\pi]$，
压缩因子 $k = \cos\theta$，定义

$$
F_L(k)(\mathbf{p}) = \mathbf{p} - (1-k)\big(\mathbf{n}\cdot\mathbf{p} - c\big)\mathbf{n}
$$

- $k = +1$：恒等；
- $k = 0$：整个面片压到折痕上（侧对观众，视觉上"消失"）；
- $k = -1$：恰为反射 $R_L$。

于是展开第 $i$ 次折叠时，被该次折叠搬动过的面片按

$$
T_i(\theta) = F_{L_i}(\cos\theta)\circ T_i^{\text{stage}}
$$

绘制，$\theta: 0 \to \pi$。$\theta = \pi$ 时结果与下一阶段**逐位相等**，
所以动画末帧与 `unfold()` 的几何结果不存在任何差异。

代码：`transforms.ts > partialFold`、`components/paper/animation.ts > unfoldFrame`。

---

## 7. 评分

设目标区域 $T$、实际结果 $A$：

$$
\mathrm{IoU} = \frac{\mathrm{area}(A\cap T)}{\mathrm{area}(A\cup T)},\qquad
\mathrm{Error} = \frac{\mathrm{area}(A \triangle T)}{\mathrm{area}(P)}
$$

判定阈值按关卡单独设定（`PuzzleLevel.tolerance`），因为
"剪掉一个角"这类目标只占纸面很小比例，IoU 对误差不敏感，
而"剪掉一整条"则相反。

代码：`game/scoring.ts > compare`。

---

## 8. 与真实折剪的对应关系

| 本应用 | 真实纸张 |
|---|---|
| `fold-x` / `fold-y` | 沿中线对折 |
| `fold-xy` / `fold-yx` | 两次对折（层序不同，几何相同） |
| `fold-diag` | 沿对角线对折 |
| 一条 `StraightCut` | 一次直线下剪 |
| 工坊的多条 `StraightCut` | 多次直线下剪，不是"一刀" |

**因此**：工坊的图案可以实物复现（多次下剪），但不会被宣传为"一刀剪出"；
只有"一刀挑战"模式下的结果才对应单次直线切割。
