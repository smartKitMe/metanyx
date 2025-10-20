# Metanyx

一个用于扫描文件元数据并存入 sqlite 的 CLI，同时提供查看与修改功能。

## 安装与运行

- 全局安装（发布后）：`npm i -g metanyx`
- 使用命令：`metanyx <动作> [数据库路径] [选项]`
- 或本地开发：`npm run dev`（对应 `node src/index.js`）

支持动作：`read | view | wri | clear | info`

## 构建

- `npm run build` 使用 Vite 以库模式打包到 `dist/`，入口为 `src/index.js`，产物带有 shebang 可直接作为 CLI 运行。

## 测试

- `npm test` 运行 Vitest（Node 环境）。
- `npm run coverage` 输出覆盖率（v8）。
- 已添加基础测试：
  - `test/meta.test.js`：校验路径归一化、存在判断、文件哈希、元数据读取、时间格式化。
  - `test/db.test.js`：校验数据库初始化、写入、计数、按路径获取、目录列表、搜索。

## 发布到 npm

1. 确认 `package.json` 中 `name`, `version`, `description`, `keywords`, `bin` 等信息正确。
2. 确保构建与测试通过：`npm run build && npm test`。
3. 登录 npm（如未登录）：`npm login`。
4. 发布：`npm publish`。

注意：发布前脚本 `prepublishOnly` 会自动执行构建与测试。

## 使用示例

- `metanyx read ./docs`：扫描目录写入数据库（默认 `metanyx.db`）。
- `metanyx view --mode search --view-ext js --table`：按后缀搜索并表格输出。
- `metanyx wri --op chmod --view-under ./src --view-ext .js --chmod 644`：按过滤批量修改权限并更新数据库记录。
- `metanyx clear`：清空 entries 表。
- `metanyx info`：查看当前数据库信息与环境。


一个面向本地文件系统的元数据采集与查询、批量修改工具。以 SQLite 存储索引，提供 `read`/`view`/`wri`/`clear`/`info` 五类动作，通过 Node.js CLI 使用。

## 特性概览
- 读取元数据（`read`）：扫描单文件或目录（仅文件），写入数据库。
- 浏览与检索（`view`）：`search` 或 `list` 两种模式；支持多维过滤与表格/JSON 输出；完全基于数据库中 `full_path` 字段。
- 修改与批量操作（`wri`）：支持 `touch`、`rename`、`chmod`、`time`（增量时间修改）。所有操作均通过数据库过滤选择目标文件，不再使用命令行目标路径。
- 数据库维护：`clear` 清空、`info` 查看信息。

## 环境与安装
- 需要 Node.js（项目为 ESM 模块）。
- 依赖 `sqlite3`（已在 `package.json`）。
- 在项目根目录执行：
  - `npm install`
  - 也可直接运行：`node src/index.js`

## 基本用法
CLI 参数顺序：
- 仅支持新顺序：`<动作> [dbPath] [选项]`

动作列表：`read | view | wri | clear | info`
- `[dbPath]` 为可选，默认 `metanyx.db`
- `read` 需要命令行提供目标路径；`view/wri` 不需要目标路径，均基于数据库的 `full_path` 字段选择目标
- 也支持 `--config <配置文件.json>` 以 JSON 配置方式运行

### 重要行为说明
- `read` 执行前会自动先调用 `clear`，清空 `entries` 表，然后再扫描写入（确保每次索引基线一致）。
- `view`：无过滤参数时默认 `search`；使用 `--view-under` 时可切换 `list` 模式（列出目录下的文件）。
- `wri`：所有操作（`touch`/`rename`/`chmod`/`time`）均通过过滤条件从数据库选择目标（仅文件），再对真实文件执行并同步数据库。

## 常用示例
### 读取并建立索引
- 清空数据库并扫描 `./src`：
  - `node src/index.js read ./src`
- 指定数据库路径：
  - `node src/index.js read ./my.db ./src`

### 浏览与检索
- 全库搜索 `.js` 文件（表格输出）：
  - `node src/index.js view --mode search --view-ext js --table`
- 列出目录下文件（需提供目录）：
  - `node src/index.js view --mode list --view-under ./src`
- 显示特定字段（人类可读时间）：
  - `node src/index.js view --mode search --fields name,mtime_human,ctime_human,atime_human`
- 以 JSON 输出：
  - `node src/index.js view --json --view-ext .js`

### 批量时间修改（增量语法）
- 在 `./src` 下的所有 `.js` 文件，`mtime` 统一加 1 小时：
  - `node src/index.js wri --op time --view-under ./src --view-ext .js --mtime "+1h"`
- 无目录限定时按后缀批量修改：
  - `node src/index.js wri --op time --view-ext .js --time-all "+30m"`
- 修改权限（基于过滤选择目标）：
  - `node src/index.js wri --op chmod --view-under ./src --view-ext .js --chmod 644`

## 过滤参数
- `--view-name <substr>` 名称子串
- `--view-ext <ext|.ext>` 后缀（如 `js` 或 `.js`）
- `--view-under <dir>` 限定目录（`list` 模式需要提供）
- `--view-mtime-from <ms>` / `--view-mtime-to <ms>` 修改时间范围（毫秒）
- `--view-ctime-from <ms>` / `--view-ctime-to <ms>` 创建时间范围（毫秒）
- `--view-size-min <bytes>` / `--view-size-max <bytes>` 大小范围（字节）
- `--view-type file|dir` 类型过滤（`search` 默认仅 `file`；`list` 已过滤目录）
- 无过滤参数时默认检索全库；存在过滤参数时默认 `type=file`

## 输出格式
- 默认表格输出（`--table`），或使用 `--json` 强制 JSON 输出
- `wri` 输出为操作列表（`Op | Path | Result`），同样支持 `--json` 输出为数组
- 若无匹配记录：输出 `无记录`

## 数据表结构（简要）
- 表：`entries`
- 主要列：`full_path`, `name`, `type`, `size`, `mtime_ms`, `ctime_ms`, `atime_ms`, `mode`, `ext`, `hash`
- 唯一索引：`full_path`

## 注意事项
- `read` 每次都会清空 `entries` 表后再写入，请谨慎使用。
- `wri` 基于过滤选择目标；若过滤命中多个文件，部分操作（例如 `rename`）会对每个文件使用相同的新名称，可能导致覆盖，请先收敛过滤条件。
- `ctime` 由系统维护，不能任意设置；时间修改操作实际作用于真实文件的时间戳，并同步数据库。

## 配置文件示例
`config.json`：
```json
{
  "action": "view",
  "dbPath": "metanyx.db",
  "view": {
    "mode": "search",
    "filters": { "ext": "js", "under": "./src" },
    "table": true
  }
}
```
运行：
- `node src/index.js --config config.json`

## 开发与运行
- 安装依赖：`npm install`
- 直接运行：`node src/index.js`
- 入口文件：`src/index.js`

如需新增功能（例如 `wri --op time` 的 `--dry-run`/`--json` 预览），可在 `src/actions/wri.js` 扩展实现，并在 `src/index.js` 更新帮助文本和参数解析。