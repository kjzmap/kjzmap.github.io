# 群友地图

网页由 GitHub Pages 从 `main` 分支根目录发布。共享模式通过 Supabase Edge Function 读写 PostgreSQL。任何访问地图的人都可以看到公开且未到期的群友标记，也可以添加自己的标记。编辑和删除自己的共享标记需要原浏览器保存的管理凭证。

## 更新地图前端

「聚合」默认关闭，头像和昵称沿用原来的位置。开启后，人数气泡会随地图缩放合并或拆开，点击可环形展开并查看同坐标群友。两种模式都可点击头像查看资料，地图会在当前浏览器记住开关状态。

将 `index.html`、`app.js` 和 `styles.css` 的改动合入 `main`。GitHub Pages 发布完成后，检查线上地图能读取已有群友、开关默认关闭，再验证开启后的缩放、环形展开、头像资料和列表定位。原有的 Supabase 函数地址和数据库继续使用。

## 启用共享

1. 在 Supabase 选定项目。保留 Data API 对 `public` schema 的访问，在 SQL Editor 执行 [数据库迁移](supabase/migrations/20261121000000_shared_markers.sql)。已用同名表的项目可重复执行该迁移。
2. 在已登录 Supabase CLI 的环境中，从仓库根目录运行 `npx supabase functions deploy qunyou-map --remote=你的项目标识 --use-api`。函数使用 Supabase 提供的服务端凭据。
3. 如需管理员功能，在 Supabase Edge Functions Secrets 中设置 `MAP_ADMIN_PASSWORD` 和 `MAP_ADMIN_SESSION_SECRET`。会话密钥请使用至少 32 个字符的独立随机值。管理员登录尝试共用每 15 分钟 8 次的上限。
4. 将 [index.html](index.html) 中 `qunyou-api-base` 的值设为 `https://你的项目标识.supabase.co/functions/v1/qunyou-map/`，保留末尾斜杠。提交并推送到 `main`。只把函数地址写入网页，管理员密码和服务端密钥保存在 Supabase。
5. 用 API 确认共享状态。在 `api/markers` 创建临时标记，用另一客户端读取，再凭原创建凭证删除。浏览器原来保存的标记仍在原浏览器显示，新建的共享标记才会写入云端。

仓库默认允许 `https://jace050313.github.io` 页面跨域访问。若更换站点域名，也需更新 [函数的允许来源](supabase/functions/qunyou-map/handler.mjs)。

全球边界来自 Natural Earth。中国省界来自阿里云 DataV。地图引擎为 Leaflet。
