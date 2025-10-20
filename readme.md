# metanyx

一个用于扫描、索引并批量查看/修改文件元数据的小工具。支持通过 sqlite 持久化，提供 CLI 接口进行 read/view/wri/clear/info 操作。

## 安装

- 需要 Node.js 18+
- 安装依赖：`npm install`
- 可选：若要启用更强的跨平台时间设置支持，安装 `utimes`（已在代码中作为后备）：`npm install utimes --save`

## 用法

用法:

```
node src/index.js <动作> [数据库路径] [选项]
或:
node src/index.js --config <配置文件.json>
```

参数说明:
- `<动作>`：必选，`read | view | wri | clear | info`
- `[数据库路径]`：可选，sqlite 文件路径，默认 `metanyx.db`

说明:
- `read` 执行前会自动先调用 `clear` 清空 `entries` 表，然后再进行扫描写入。

### 选项（节选）

- `--fields a,b,c`：view 指定输出字段（支持 `mtime_human/ctime_human/atime_human`）
- `--mode list|search`：view 输出模式（默认：无过滤时为 `search`；指定 `--view-under` 时可用 `list`）
- `--op touch|rename|chmod|time`：wri 具体操作（均基于数据库过滤选择目标）
- `--new-name <name>`：wri rename 的新文件名
- `--chmod <perm>`：wri chmod 权限，如 `644` 或 `0o644`
- `--table`：输出为表格（默认启用；与 `--json` 互斥；`read/view/wri` 支持）
- `--json`：输出为 JSON（覆盖默认表格输出；`read/view/wri` 支持）

### wri 时间修改（增量语法）

- `+` 表示增加，`-` 表示减少；单位：`d/h/m/s/ms`；可组合如 `+1h30m`
- `--mtime "+1h30m"` 修改修改时间
- `--atime "-2d"` 修改访问时间
- `--time-all "+10m"` 同时修改 atime/mtime
- `--ctime-touch` 额外刷新 ctime（通过安全重命名触发，ctime 由系统维护不可直接设定；刷新后 ctime 为系统当前时间）

实现细节：
- 优先尝试 `@ronomon/utimes` 设置 `mtime/atime`；若不可用，使用 `utimes` 包；仍不可用则降级到 Node.js 内置 `fs.promises.utimes`。
- 注意：Linux 不支持设置 `btime`；`ctime` 不能直接设置，仅能通过实际变更触发刷新（这里用重命名）。

### view 搜索过滤（支持短别名；时间边界支持字符串输入）

- `--view-name/--name <substr>` 按名称子串匹配
- `--view-ext/--ext <ext|.ext>` 按后缀精确匹配，如 `js` 或 `.js`
- `--view-under/--under <dir>` 限定在某目录前缀下（list 模式需要提供）
- `--view-mtime-from/--mtime-from <time>` 修改时间下限（字符串，如 `2024-10-01` 或 `2024-10-01 12:00[:30]` 或 `now`）
- `--view-mtime-to/--mtime-to <time>` 修改时间上限（字符串，同上；无秒时自动补全到 `59:59.999`）
- `--view-ctime-from/--ctime-from <time>` 创建时间下限（字符串）
- `--view-ctime-to/--ctime-to <time>` 创建时间上限（字符串）
- `--view-size-min/--size-min <bytes>` 文件大小下限（字节）
- `--view-size-max/--size-max <bytes>` 文件大小上限（字节）
- `--view-type/--type file|dir` 类型过滤（`search` 默认仅 file；`list` 已过滤目录）

时间字符串支持：`YYYY-MM-DD`、`YYYY-MM-DD HH:mm`、`YYYY-MM-DD HH:mm:ss`、`YYYY-MM-DDTHH:mm[:ss]`、`now`（本地时区）。

## 为什么之前 ctime 没变？如何验证已修复

- 说明：`fs.utimes` 只能设置 `atime/mtime`，`ctime` 由文件系统在变更时自动更新，无法直接设置。
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