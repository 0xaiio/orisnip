# 如何获得发布能力

> 本文记录的是**排查结论**，依据是客户端 `5.9.2` 的实际实现，不是猜测。
> 结论：发布能力不是「安装」出来的，而是**会话级注入的宿主工具**；
> 当前这个对话运行在**编程（coding）通道**，该通道在设计上就不下发发布工具。

---

## 一、工具在哪里

`workbuddy_sites_deploy` 是宿主侧 MCP 工具，挂在 `connector-proxy` 服务上：

```
connector-proxy: [ connect_cloud_service, connect_open_platform,
                   workbuddy_sites_deploy, workbuddy_sites_unpublish,
                   workbuddy_cloud_service, ... ]
```

它不在 npm 里，也无法通过安装插件获得。能不能用，取决于**当前会话拿到的工具集**。

## 二、两道闸门

### 闸门 A：场景模式（scene mode）

客户端按场景下发工具（`resources/app.asar` 内的 `resolveModeTools`）：

| 场景 | 是否含发布工具 |
|---|---|
| `craft`（造物 / 设计应用） | ✅ 含 `Defer(workbuddy_sites_deploy)`、`Defer(workbuddy_cloud_service)` |
| `ask` / `plan` / `expert` | ❌ 不含 |
| `quick` | ❌ 空集 |
| **`coding` 入口（本会话）** | ❌ **CLI 通道，工具预设里明确排除了它** |

客户端源码中的原始注释（`@genie/agent-harness/cli/dist-server/lite/tool-presets.js`）：

> agent-cli 没有的名字：… `Defer(workbuddy_sites_deploy)` ——
> **宿主侧 MCP 产品工具，其注入车道打通后归 MCP 面另议**

本会话的 `welcomeMode` 是 `coding`，运行在 codebuddy CLI 通道，
所以拿不到这三个工具。这与「安装缺失」无关。

### 闸门 B：账户能力

即使场景对了，客户端还会做一次能力过滤：

```js
_c = ['sites', 'cloud-service']
vc = ['workbuddy_sites_deploy', 'workbuddy_sites_unpublish', 'workbuddy_cloud_service']

function isFullstackWebsiteCapabilityBlocked(account) {
  return account
    ? account.disabledByProductFeature === true ||
      (!isIOAEnterpriseId(account.enterpriseId) && isEnterpriseAccount(account))
    : false;
}
```

即：当账户被标记 `disabledByProductFeature`，或属于
`ultimate / exclusive / premise` 企业版但不在内部白名单时，
上面三个工具会被一并剔除——表现就是「对话里没有发布入口，设置里也没有应用页签」。

---

## 三、按顺序尝试

### 1. 换一个入口重开对话（最可能有效）

1. 回到 WorkBuddy 首页，**从「设计 / 应用」入口新建对话**（不要用「编程」入口）。
2. 工作目录仍然选 `D:\code-repo\orisnip`（代码、`dist/`、文档都在本地，也已推到 GitHub）。
3. 把下面这段直接粘进去：

```
这个项目已经完成开发，现在只需要发布。
请用网站应用发布能力把它发布出去（静态站点，目录就是当前工作区），
应用名：一刀万象。
发布后请打开返回的分享链接验证首页能正常渲染，并告诉我完整链接。
```

新对话跑在 craft 场景下，会拿到 `workbuddy_sites_deploy`，一步就能上线。

### 2. 检查账户是否开通了「网站应用」

- 打开 **设置 → 数据管理 → 应用**。
- 能看到「应用」页签且有列表 → 能力已开通，问题在入口（回到第 1 步）。
- 该页签缺失、或提示需要开通/升级 → 属于闸门 B，需要开通对应套餐或联系管理员。

### 3. 刷新账户状态

退出登录后重新登录，或重启客户端，让能力标记重新拉取。

---

## 四、为什么不能用第三方托管替代

投稿表单第 06 项写明：

> 链接必须包含有效的 **sharecode** 参数

`sharecode` 是 WorkBuddy 发布链路生成的参数，GitHub Pages / Vercel / Netlify 的地址
不会带这个参数，**不能用于投稿**。所以「先随便托管一下」不解决问题。

---

## 五、发布前的准备状态（已完成）

| 项目 | 状态 |
|---|---|
| 生产构建 | ✅ `npm run build` 通过，产物在 `dist/`（343 kB JS / gzip 114 kB） |
| 静态托管兼容 | ✅ `base: './'`，可部署在任意子路径 |
| 路由 | ✅ hash 路由，无需服务端 rewrite |
| 构建后浏览器验收 | ✅ 8 路由 × 2 视口，0 控制台错误、0 横向溢出 |
| 关卡闭环 | ✅ 点击「剪一刀」→ 逐层展开 → IoU 100% |
| 工坊保存闭环 | ✅ 保存 → 我的作品出现卡片 |
| 投稿材料 | ✅ `submission/` 七份文档 + 11 张真实截图 |

也就是说：**一旦拿到发布工具，发布本身只需要一条命令、几十秒**，
不需要再改任何代码。

---

## 六、发布后要做的三件事

1. 浏览器打开返回的链接，跑一遍 `submission/公开发布与投稿检查清单.md` 第三节。
2. 把链接回填到 `submission/参赛报名信息.md` 的「体验链接」。
3. 确认链接里带 `sharecode`，再粘到投稿表单第 06 项。
