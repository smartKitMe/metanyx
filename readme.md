# metanyx

A tiny local file metadata indexer & batch operator.

## 快速开始

- 安装依赖：`npm i`
- 初始化数据库并索引：`node src/index.js read ./your-dir`
- 查看：
  - `node src/index.js view --mode search --json`
  - `node src/index.js view --mode list --under ./src --json`
- 批量操作：
  - 修改权限：`node src/index.js wri --op chmod --under ./src --ext .js --chmod 644`
  - 修改时间：`node src/index.js wri --op time --time-all "+10m" --ext md`

## 重要概念

- 数据库路径：所有动作默认使用 `metanyx.db`，也可以在动作名后面显式传入路径（例如 `node src/index.js view ./data.db --mode search`）。
- 选择目标：`view`/`wri` 全部基于数据库记录选择目标，不需要提供 `targetPath`，使用过滤参数即可。
- 模式：
  - `search`：按过滤条件搜索（默认，无过滤时返回全库，存在过滤时默认 `type=file`）。
  - `list`：列出某目录下文件，需提供 `--under <dir>`（不需要 `targetPath`）。
  - `single`：针对单个路径（目前主要用于内部实现）。

## 过滤参数（支持短别名）

- `--view-name/--name <substr>` 名称包含子串
- `--view-ext/--ext <ext|.ext>` 后缀精确匹配，如 `js` 或 `.js`
- `--view-under/--under <dir>` 限定在某目录前缀下（会自动规范为绝对路径）
- `--view-mtime-from/--mtime-from <ms>` 修改时间下限
- `--view-mtime-to/--mtime-to <ms>` 修改时间上限
- `--view-ctime-from/--ctime-from <ms>` 创建时间下限
- `--view-ctime-to/--ctime-to <ms>` 创建时间上限
- `--view-size-min/--size-min <bytes>` 大小下限
- `--view-size-max/--size-max <bytes>` 大小上限
- `--view-type/--type file|dir` 类型（`search` 默认仅 file；`list` 已过滤目录）

## wri 操作

- `chmod`：`--chmod 644` 或 `--chmod 0o644`
- `rename`：`--new-name <name>`（注意：多文件时可能覆盖，同名策略务必谨慎）
- `time`：支持增量语法，`+` 表示增加、`-` 表示减少，单位 `d/h/m/s/ms`，可组合如 `+1h30m`
  - `--mtime "+1h30m"` 修改修改时间
  - `--atime "-2d"` 修改访问时间
  - `--time-all "+10m"` 同时修改 atime/mtime
  - `--ctime-touch` 额外刷新 ctime（通过安全重命名触发，ctime 由系统维护不可直接设定；刷新后 ctime 为系统当前时间）

### 为什么之前 ctime 没变？如何验证已修复

- 说明：`fs.utimes` 只能设置 atime/mtime，`ctime` 由文件系统在变更时自动更新，无法直接设置。
- 修复：新增 `--ctime-touch`，在执行时间修改后对文件进行一次安全重命名（到临时名再改回），从而触发文件系统刷新 `ctime`。
- 验证：执行如下命令并观察 `ctime_ms` 与 `ctime_human` 是否变化。
  - `node src/index.js view --mode search --ext md --json`
  - `node src/index.js wri --op time --time-all "+10d" --ctime-touch --ext md --json`

## 使用示例

- 索引 `node_modules`：`node src/index.js read ./node_modules`
- 查看某目录 `.js` 文件：`node src/index.js view --mode list --under ./src --ext .js --json`
- 批量修改 `.md` 的时间并刷新 ctime：`node src/index.js wri --op time --time-all "+10d" --ctime-touch --ext md --json`

## 常见问题

- `SQLITE_CANTOPEN`: 请确保第二参数是 `targetPath`（仅限 `read`），第三参数才是数据库路径。例如：
  - 正确：`node src/index.js read ./docs` 或 `node src/index.js read ./docs ./data.db`
  - 错误：`node src/index.js read ./node_modules` 被当作 dbPath 时会报错，现已修复入口解析以避免误判
- 无匹配文件：请检查过滤条件是否正确，尤其是 `--under` 是否为存在的目录；在 `search` 模式下我们会自动规范为绝对路径。

## 输出形式

- `--table` 默认输出为表格；`--json` 强制输出 JSON。
- `view` 支持指定字段：`--fields full_path,mtime_human,ctime_human`。