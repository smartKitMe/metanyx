import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute as readExecute } from './actions/read.js';
import { execute as viewExecute } from './actions/view.js';
import { execute as wriExecute } from './actions/wri.js';
import { execute as clearExecute } from './actions/clear.js';
import { execute as infoExecute } from './actions/info.js';

function printUsage() {
  console.log(`用法:
  1) node src/index.js <动作> [数据库路径] [选项]
  或:
  node src/index.js --config <配置文件.json>

参数说明:
  <动作>       必选，read | view | wri | clear | info
  [数据库路径] 可选，sqlite 文件路径，默认 metanyx.db

说明:
  read 执行前会自动先调用 clear 清空 entries 表，然后再进行扫描写入。

选项:
  --config <file>       使用 JSON 配置文件
  --fields a,b,c        view 指定输出字段（支持 mtime_human/ctime_human/atime_human）
  --mode list|search    view 输出模式（默认：无过滤时为 search；指定 --view-under 时可用 list）
  --op touch|rename|chmod|time  wri 具体操作（均基于数据库过滤选择目标）
  --new-name <name>     wri rename 的新文件名
  --chmod <perm>        wri chmod 权限，如 644 或 0o644
  --table               输出为表格（默认启用；与 --json 互斥；read/view/wri 支持）
  --json                输出为 JSON（覆盖默认表格输出；read/view/wri 支持）

wri 时间修改（增量语法，+ 表示增加，- 表示减少；单位：d/h/m/s/ms）：
  --mtime "+1h30m"      修改修改时间（示例：加 1 小时 30 分钟）
  --ctime "+500ms"     修改变更时间（说明：ctime 由系统维护，无法设为任意值；本参数将被忽略，最终以文件系统实际 ctime 为准）
  --atime "-2d"         修改访问时间（示例：减 2 天）
  --time-all "+10m"    同时修改 atime/mtime（示例：统一加 10 分钟）

view 搜索过滤（可组合使用）：
  --view-name <substr>        按名称子串匹配
  --view-ext <ext|.ext>       按后缀精确匹配，如 js 或 .js
  --view-under <dir>          限定在某目录前缀下（list 模式需要提供）
  --view-mtime-from <ms>      修改时间下限（毫秒）
  --view-mtime-to <ms>        修改时间上限（毫秒）
  --view-ctime-from <ms>      创建时间下限（毫秒）
  --view-ctime-to <ms>        创建时间上限（毫秒）
  --view-size-min <bytes>     文件大小下限（字节）
  --view-size-max <bytes>     文件大小上限（字节）
  --view-type file|dir        类型过滤（search 默认仅 file；list 已过滤目录）
  注：无过滤参数时默认检索全库；存在过滤参数时默认 type=file

示例:
  node src/index.js read ./docs
  node src/index.js read ./docs ./data.db
  node src/index.js view --mode search --view-ext js --table
  node src/index.js view --mode list --view-under ./src --table
  node src/index.js wri --op chmod --view-under ./src --view-ext .js --chmod 644
  node src/index.js clear
  node src/index.js info
  node src/index.js --config config.json
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const configIdx = args.indexOf('--config');
  if (configIdx !== -1) {
    const cfgPath = args[configIdx + 1];
    if (!cfgPath) {
      console.error('缺少 --config 参数的文件路径');
      process.exit(1);
    }
    return loadConfig(cfgPath);
  }

  if (args.length < 1) {
    printUsage();
    process.exit(1);
  }

  const allowed = ['read', 'view', 'wri', 'clear', 'info'];

  let action;
  let dbPath;
  let startIdx = 0;

  // 新顺序仅支持：
  // 1) <动作> [db] [flags]
  if (allowed.includes(args[0])) {
    action = args[0];
    const second = args[1];
    if (second && !second.startsWith('--') && !allowed.includes(second)) {
      dbPath = second;
      startIdx = 2;
    } else {
      startIdx = 1;
    }
  } else {
    console.error('参数解析失败：仅支持新顺序 <动作> [数据库路径] [选项]');
    printUsage();
    process.exit(1);
  }

  validateAction(action);

  const options = parseFlags(args.slice(startIdx));

  return {
    action,
    dbPath,
    view: {
      fields: options.fields,
      mode: options.mode,
      filters: {
        name: options.view_name,
        ext: options.view_ext,
        under: options.view_under,
        mtime_from: options.view_mtime_from,
        mtime_to: options.view_mtime_to,
        ctime_from: options.view_ctime_from,
        ctime_to: options.view_ctime_to,
        size_min: options.view_size_min,
        size_max: options.view_size_max,
        type: options.view_type,
      },
      table: options.view_table,
      json: options.view_json,
    },
    wri: {
      op: options.op,
      extra: options.extra,
    },
  };
}

function parseFlags(flags) {
  const out = { extra: {} };
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    if (f === '--fields') {
      out.fields = (flags[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (f === '--mode') {
      out.mode = flags[++i];
    } else if (f === '--op') {
      out.op = flags[++i];
    } else if (f === '--new-name') {
      out.extra.newName = flags[++i];
    } else if (f === '--chmod') {
      const raw = flags[++i];
      let perm;
      if (raw?.startsWith('0o')) perm = parseInt(raw.slice(2), 8);
      else if (/^[0-7]{3,4}$/.test(raw)) perm = parseInt(raw, 8);
      else perm = parseInt(raw, 10);
      out.extra.mode = perm;
    } else if (f === '--view-name') {
      out.view_name = flags[++i];
    } else if (f === '--view-ext') {
      out.view_ext = flags[++i];
    } else if (f === '--view-under') {
      out.view_under = flags[++i];
    } else if (f === '--view-mtime-from') {
      out.view_mtime_from = Number(flags[++i]);
    } else if (f === '--view-mtime-to') {
      out.view_mtime_to = Number(flags[++i]);
    } else if (f === '--view-ctime-from') {
      out.view_ctime_from = Number(flags[++i]);
    } else if (f === '--view-ctime-to') {
      out.view_ctime_to = Number(flags[++i]);
    } else if (f === '--view-size-min') {
      out.view_size_min = Number(flags[++i]);
    } else if (f === '--view-size-max') {
      out.view_size_max = Number(flags[++i]);
    } else if (f === '--view-type') {
      out.view_type = flags[++i];
    } else if (f === '--table') {
      out.view_table = true;
    } else if (f === '--json') {
      out.view_json = true;
    } else if (f === '--mtime') {
      out.extra.mtime = flags[++i];
    } else if (f === '--ctime') {
      out.extra.ctime = flags[++i];
    } else if (f === '--atime') {
      out.extra.atime = flags[++i];
    } else if (f === '--time-all') {
      out.extra.time_all = flags[++i];
    }
  }
  return out;
}

function validateAction(action) {
  const allowed = ['read', 'view', 'wri', 'clear', 'info'];
  if (!allowed.includes(action)) {
    console.error(`未知动作: ${action}`);
    printUsage();
    process.exit(1);
  }
}

function loadConfig(cfgPath) {
  const abs = path.resolve(cfgPath);
  if (!fs.existsSync(abs)) {
    console.error(`配置文件不存在: ${abs}`);
    process.exit(1);
  }
  let cfg;
  try {
    const text = fs.readFileSync(abs, 'utf-8');
    cfg = JSON.parse(text);
  } catch (e) {
    console.error('配置文件解析失败:', e);
    process.exit(1);
  }
  if (!cfg.action) {
    console.error('配置文件必须包含 action');
    process.exit(1);
  }
  if (!['read', 'view', 'wri', 'clear', 'info'].includes(cfg.action)) {
    console.error(`配置文件 action 非法: ${cfg.action}`);
    process.exit(1);
  }
  cfg.dbPath = cfg.dbPath || 'metanyx.db';
  return cfg;
}

async function main() {
  const argv = process.argv.slice(2);
  const cfg = parseArgs(argv);

  if (cfg.action === 'read') {
    const tp = argv[1] && !argv[1].startsWith('--') ? argv[1] : undefined;
    const targetPath = tp || undefined;
    if (!targetPath) {
      console.error('read 动作需要提供目标路径');
      process.exit(1);
    }
    await clearExecute({ dbPath: cfg.dbPath });
    await readExecute({ targetPath, dbPath: cfg.dbPath, json: cfg.view?.json });
  } else if (cfg.action === 'view') {
    await viewExecute({
      dbPath: cfg.dbPath,
      mode: cfg.view?.mode,
      fields: cfg.view?.fields,
      filters: cfg.view?.filters,
      table: cfg.view?.table,
      json: cfg.view?.json,
    });
  } else if (cfg.action === 'wri') {
    const op = cfg.wri?.op;
    if (!op) {
      console.error('wri 需要通过 --op 或配置提供具体操作');
      process.exit(1);
    }
    await wriExecute({ action: op, dbPath: cfg.dbPath, extra: cfg.wri?.extra, filters: cfg.view?.filters, json: cfg.view?.json });
  } else if (cfg.action === 'clear') {
    await clearExecute({ dbPath: cfg.dbPath });
  } else if (cfg.action === 'info') {
    await infoExecute({ dbPath: cfg.dbPath });
  }
}

main().catch((e) => {
  console.error('执行失败:', e);
  process.exitCode = 1;
});