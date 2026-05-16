<p align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5" />
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/IndexedDB-404D59?style=for-the-badge&logo=indexeddb&logoColor=white" alt="IndexedDB" />
  <img src="https://img.shields.io/badge/GeoJSON-FFB71B?style=for-the-badge&logo=geojson&logoColor=black" alt="GeoJSON" />
  <img src="https://img.shields.io/badge/天地图-0055AA?style=for-the-badge&logo=tencentqq&logoColor=white" alt="天地图" />
</p>

## 🔧 使用方法

### 1. 基础操作

| 操作 | 说明 |
|------|------|
| 点击 **开始绘制** | 进入绘制状态（左键绘制，右键擦除） |
| 空格键 | 快速切换绘制 / 停止绘制 |
| ESC 键 | 退出绘制模式，或退出清屏模式 |
| 鼠标滚轮 | 缩放地图 / 画板 |
| Ctrl + 滚轮 | 调整画笔半径 |
| Shift + 滚轮 | 调整画笔强度 |
| Alt + 滚轮 | 调整画笔模糊度 |

### 2. 地图模式

- 右侧工具栏调整画笔参数。
- 点击“地图/画板”切换按钮可进入画板模式。
- 支持切换地图风格（矢量、卫星、地形，含/无路网）。

### 3. 画板模式

1. 点击 **画板模式** 按钮。
2. 点击 **上传图片** 加载本地图片作为底图。
3. 在图片上绘制热力图（支持平移、缩放）。

### 4. 图层管理

- **新建图层**：点击图层管理右上角的 `+`。
- **重命名 / 删除 / 导出**：鼠标悬停图层时出现对应按钮。
- **图层显隐**：点击图层右侧的 iOS 风格开关。
- **当前图层**：高亮显示，绘制的点将保存到当前图层。

### 5. 自定义配色

1. 点击色带右侧的 **+** 按钮。
2. 在编辑器中：
   - 输入方案名称。
   - 点击渐变条下方空白区域添加色标节点。
   - 拖动节点调整位置，或使用下方颜色选择器 / 位置百分比修改。
   - 点击节点可选中，按垃圾桶按钮删除（至少保留两个节点）。
3. 保存后，新方案会出现在下拉菜单中，并自动应用。

### 6. 数据导入 / 导出

#### 导出 GeoJSON
- 在图层管理面板中点击 **导出** 按钮 → 选择要导出的图层 → **导出 GeoJSON**。
- 生成的 GeoJSON 包含每个点的坐标、半径、强度、模糊度及所属图层名。

#### 导入 GeoJSON
- 点击底部 **导入GeoJSON** 按钮，选择 `.geojson` 或 `.json` 文件。
- 系统会自动识别数据类型（地图点或画板点），并创建新图层。

#### 导出 PNG 图片
- 导出菜单中点击 **导出 PNG**。
- 选择 **仅热力图（透明背景）** 或 **热力图+底图**。
- 透明背景支持 96 DPI / 300 DPI 高清导出。
- **注意**：由于地图瓦片版权限制，导出“热力图+底图”时，程序会提示使用 **清屏模式 + 系统截图** 方式获取带地图的合成图。

---

## 🛠️ 本地部署

1. 克隆或下载本项目源码。
2. 申请自己的天地图 API 密钥（[天地图官网](http://lbs.tianditu.gov.cn/)），替换 `index.html` 中脚本引入的 `tk` 参数以及 `js.js` 中 `MapManager` 构造函数内的 `tk` 值。
3. 使用任意 HTTP 服务器（如 `live-server`、`python -m http.server`）打开 `index.html`。
   > 直接双击打开可能因跨域或 IndexedDB 限制导致部分功能异常。

---

## ⚠️ 注意事项

- **天地图密钥**：代码中内置的密钥仅用于演示，请更换为个人申请的密钥，以免超出使用限额。
- **画板模式图片**：建议图片尺寸不超过 4000×4000 像素，过大可能导致渲染性能下降。
- **浏览器兼容性**：建议使用最新版 Chrome、Edge、Firefox，需支持 IndexedDB 和 Canvas。
- **数据安全**：所有数据均存储在本地浏览器中，不会上传到任何服务器。
- **源码**：为了避免过渡篡改滥用，仅index源码简单加密。
---

## 📜 开源许可

本工具仅用于学习交流，请勿用于商业用途。如需二次开发，请保留原始版权信息。

---



**感谢使用，希望这个工具能为你的热力图绘制带来便利！** 🎨🔥
