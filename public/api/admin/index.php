<?php
/**
 * Панель заявок «Чай + DJ»: вход по паролю, список с фильтром и поиском, карточка заявки (статус, заметка, история),
 * выгрузка в CSV (Excel), удаление по запросу клиента (152-ФЗ), подключение чата Telegram.
 * Пароль задаётся секретом ADMIN_PASSWORD в GitHub — в config.php попадает только его хеш.
 */
declare(strict_types=1);
require dirname(__DIR__) . '/lib.php';

header('X-Robots-Tag: noindex, nofollow');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");

session_name('cdj_admin');
session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 14, 'path' => '/api/admin/', 'secure' => !empty($_SERVER['HTTPS']), 'httponly' => true, 'samesite' => 'Strict']);
session_start();

$hash = cfg()['admin_password_hash'] ?? '';
$self = strtok($_SERVER['REQUEST_URI'] ?? '/api/admin/', '?');
function go(string $to): void { header('Location: ' . $to); exit; }
function csrf(): string { return $_SESSION['csrf'] ??= bin2hex(random_bytes(16)); }
function check_csrf(): void { if (!hash_equals($_SESSION['csrf'] ?? '', (string)($_POST['csrf'] ?? ''))) { http_response_code(400); exit('Сессия устарела — обновите страницу.'); } }

/* ---------- Вход ---------- */
$err = '';
if (!$hash) { $view = 'nopass'; }
elseif (empty($_SESSION['ok'])) {
  $view = 'login';
  if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $lockFile = private_dir() . '/login_' . md5($_SERVER['REMOTE_ADDR'] ?? '');
    $tries = is_file($lockFile) ? json_decode((string)file_get_contents($lockFile), true) : ['n' => 0, 't' => 0];
    if ($tries['n'] >= 5 && time() - $tries['t'] < 600) $err = 'Слишком много попыток. Подождите 10 минут.';
    elseif (password_verify((string)($_POST['password'] ?? ''), $hash)) {
      session_regenerate_id(true); $_SESSION['ok'] = 1; @unlink($lockFile);
      go($self . (!empty($_POST['lead']) ? '?lead=' . (int)$_POST['lead'] : ''));
    } else {
      $tries = ['n' => ($tries['n'] ?? 0) + 1, 't' => time()]; @file_put_contents($lockFile, json_encode($tries));
      usleep(400000); $err = 'Неверный пароль.';
    }
  }
} else { $view = 'app'; }

/* ---------- Действия ---------- */
if ($view === 'app') {
  $act = $_POST['act'] ?? $_GET['act'] ?? '';
  if ($act === 'logout') { $_SESSION = []; session_destroy(); go($self); }
  if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    check_csrf();
    $id = (int)($_POST['id'] ?? 0);
    $at = now_tz()->format('Y-m-d H:i:s');
    $log = fn(int $lid, string $t) => db()->prepare('INSERT INTO lead_log (lead_id, at, text) VALUES (?,?,?)')->execute([$lid, $at, $t]);
    if ($act === 'save' && $id) {
      $old = db()->prepare('SELECT status, note FROM leads WHERE id = ?'); $old->execute([$id]); $o = $old->fetch();
      $st = array_key_exists($_POST['status'] ?? '', STATUSES) ? $_POST['status'] : ($o['status'] ?? 'new');
      $note = mb_substr(trim((string)($_POST['note'] ?? '')), 0, 4000);
      db()->prepare('UPDATE leads SET status = ?, note = ?, updated_at = ? WHERE id = ?')->execute([$st, $note, $at, $id]);
      if ($o && $o['status'] !== $st) $log($id, 'Статус: ' . STATUSES[$o['status']] . ' → ' . STATUSES[$st]);
      if ($o && $o['note'] !== $note) $log($id, 'Заметка обновлена');
      go($self . '?lead=' . $id . '&saved=1');
    }
    if ($act === 'delete' && $id) {
      db()->prepare('DELETE FROM leads WHERE id = ?')->execute([$id]);
      db()->prepare('DELETE FROM lead_log WHERE lead_id = ?')->execute([$id]);
      go($self . '?deleted=1');
    }
    if ($act === 'tg_link') {
      $chats = json_decode(setting('tg_chats') ?: '{}', true) ?: [];
      $chats[(string)$_POST['chat']] = mb_substr((string)($_POST['title'] ?? ''), 0, 80);
      setting('tg_chats', json_encode($chats, JSON_UNESCAPED_UNICODE));
      tg_call('sendMessage', ['chat_id' => $_POST['chat'], 'text' => '✅ Чат подключён: сюда будут приходить заявки с эвентчай.рф']);
      go($self . '?tab=tg&linked=1');
    }
    if ($act === 'tg_unlink') {
      $chats = json_decode(setting('tg_chats') ?: '{}', true) ?: [];
      unset($chats[(string)$_POST['chat']]); setting('tg_chats', json_encode($chats, JSON_UNESCAPED_UNICODE));
      go($self . '?tab=tg');
    }
    if ($act === 'tg_test') { $ok = tg_send('🫖 Проверка: уведомления о заявках работают.'); go($self . '?tab=tg&test=' . ($ok ? 1 : 0)); }
  }
  if ($act === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="zayavki-' . now_tz()->format('Y-m-d') . '.csv"');
    $f = fopen('php://output', 'w'); fwrite($f, "\xEF\xBB\xBF");
    fputcsv($f, ['Номер', 'Дата', 'Статус', 'Имя', 'Контакт', 'Почта', 'Формат', 'Настроение', 'Гостей', 'Дата события', 'Заметка', 'Параметры', 'UTM'], ';');
    foreach (db()->query('SELECT * FROM leads ORDER BY id DESC') as $r) {
      fputcsv($f, [$r['code'], $r['created_at'], STATUSES[$r['status']] ?? $r['status'], $r['name'], $r['contact'], $r['email'], FORMATS[$r['fmt']] ?? '', $r['mood'], $r['guests'] ?: '', $r['event_date'], $r['note'],
        implode('; ', array_map(fn($k, $v) => "$k: $v", array_keys(json_decode($r['params'] ?: '{}', true) ?: []), json_decode($r['params'] ?: '{}', true) ?: [])), $r['utm']], ';');
    }
    exit;
  }
}

/* ---------- Данные для экрана ---------- */
$tab = $_GET['tab'] ?? '';
$lead = null; $logRows = [];
if ($view === 'app' && !empty($_GET['lead'])) {
  $st = db()->prepare('SELECT * FROM leads WHERE id = ?'); $st->execute([(int)$_GET['lead']]); $lead = $st->fetch() ?: null;
  if ($lead) { $l = db()->prepare('SELECT * FROM lead_log WHERE lead_id = ? ORDER BY id DESC'); $l->execute([$lead['id']]); $logRows = $l->fetchAll(); }
}
$list = []; $counts = [];
if ($view === 'app' && !$lead && $tab !== 'tg') {
  foreach (db()->query('SELECT status, COUNT(*) n FROM leads GROUP BY status') as $r) $counts[$r['status']] = (int)$r['n'];
  $where = []; $args = [];
  $f = $_GET['s'] ?? 'open';
  if ($f === 'open') $where[] = "status NOT IN ('done','lost')";
  elseif (array_key_exists($f, STATUSES)) { $where[] = 'status = ?'; $args[] = $f; }
  if (($q = trim((string)($_GET['q'] ?? ''))) !== '') { $where[] = '(name LIKE ? OR contact LIKE ? OR code LIKE ? OR note LIKE ?)'; array_push($args, "%$q%", "%$q%", "%$q%", "%$q%"); }
  $st = db()->prepare('SELECT * FROM leads' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 300');
  $st->execute($args); $list = $st->fetchAll();
}
$tgChats = []; $tgFound = [];
if ($view === 'app' && $tab === 'tg') {
  $tgChats = json_decode(setting('tg_chats') ?: '{}', true) ?: [];
  if (!empty(cfg()['tg_token'])) {
    [, $res] = tg_call('getUpdates', ['limit' => 50]);
    foreach ($res['result'] ?? [] as $u) {
      $c = $u['message']['chat'] ?? $u['my_chat_member']['chat'] ?? null; if (!$c) continue;
      $tgFound[(string)$c['id']] = $c['title'] ?? trim(($c['first_name'] ?? '') . ' ' . ($c['last_name'] ?? '')) ?: ('@' . ($c['username'] ?? $c['id']));
    }
  }
}
$phoneHref = fn(string $c) => $c !== '' && $c[0] === '@' ? 'https://t.me/' . substr($c, 1) : 'tel:+' . preg_replace('/\D/', '', $c);
$csrf = csrf();
?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><title>Заявки — Чай + DJ</title>
<style>
:root { --coal:#1C1B18; --coal2:#262420; --rice:#EDE6DA; --rice2:#E4DCCD; --brass:#C8A165; --brassd:#7A5A2B; --ember:#E8743B; --line:#D6CCBB; --muted:#5E584E; color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: var(--rice); color: var(--coal); }
a { color: var(--brassd); }
header { position: sticky; top: 0; z-index: 5; background: var(--coal); color: var(--rice); padding: 12px max(16px, env(safe-area-inset-left)); display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
header b { font-size: 17px; letter-spacing: -.01em; }
header nav { display: flex; gap: 6px; flex-wrap: wrap; }
header a, header button { color: var(--rice); text-decoration: none; padding: 8px 12px; border-radius: 999px; border: 1px solid rgb(237 230 218 / .25); background: none; font: inherit; cursor: pointer; }
header a.on { background: var(--brass); color: var(--coal); border-color: var(--brass); }
main { max-width: 1100px; margin: 0 auto; padding: 20px max(16px, env(safe-area-inset-left)) 60px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.chips a { text-decoration: none; padding: 7px 12px; border-radius: 999px; background: #F4EFE6; border: 1px solid var(--line); color: var(--coal); font-size: 14px; }
.chips a.on { background: var(--coal); color: var(--rice); border-color: var(--coal); }
.chips small { opacity: .65; margin-left: 4px; }
form.search { display: flex; gap: 8px; margin-bottom: 16px; }
input, select, textarea { font: inherit; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: #FBF8F3; color: var(--coal); width: 100%; }
textarea { min-height: 120px; resize: vertical; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 0 18px; border-radius: 999px; border: 0; background: var(--coal); color: var(--rice); font: 600 15px system-ui, sans-serif; cursor: pointer; text-decoration: none; white-space: nowrap; }
.btn.brass { background: var(--brass); color: var(--coal); }
.btn.ghost { background: none; color: var(--coal); border: 1px solid var(--line); }
.btn.danger { background: none; color: #A2311B; border: 1px solid #E2B6A8; }
.list { display: grid; gap: 8px; }
.row { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: 4px 16px; align-items: center; padding: 14px 16px; background: #F7F2EA; border: 1px solid var(--line); border-radius: 14px; text-decoration: none; color: inherit; }
.row:hover { border-color: var(--brassd); }
.row .code { font-weight: 600; font-variant-numeric: tabular-nums; font-size: 13.5px; }
.row .when { color: var(--muted); font-size: 12.5px; }
.row .who { font-weight: 600; }
.row .what { color: var(--muted); font-size: 13.5px; }
.pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 600; background: var(--rice2); }
.pill.new { background: var(--ember); color: var(--coal); }
.pill.work { background: #F1D9A8; } .pill.quote { background: #E8D7B9; } .pill.deal { background: var(--brass); }
.pill.done { background: #CFE0C3; } .pill.lost { background: #E3D6D2; color: #6B4A40; }
.empty { padding: 40px 16px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 14px; }
.card { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.box { background: #F7F2EA; border: 1px solid var(--line); border-radius: 16px; padding: 18px; display: grid; gap: 12px; }
.box h2 { margin: 0; font-size: 20px; letter-spacing: -.01em; }
dl { margin: 0; display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 6px 12px; }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
.acts { display: flex; gap: 8px; flex-wrap: wrap; }
.log { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 13.5px; color: var(--muted); }
.ok { background: #DDEBD2; border-radius: 10px; padding: 10px 12px; }
.warn { background: #F6E1CF; border-radius: 10px; padding: 10px 12px; }
.login { max-width: 360px; margin: 12vh auto; display: grid; gap: 12px; }
label { font-weight: 600; font-size: 14px; display: grid; gap: 6px; }
@media (max-width: 760px) {
  .row { grid-template-columns: minmax(0, 1fr) auto; }
  .row .meta { grid-column: 1 / -1; display: flex; gap: 10px; }
  .card { grid-template-columns: 1fr; }
  dl { grid-template-columns: 110px minmax(0, 1fr); }
}
:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
</style>
</head>
<body>
<?php if ($view === 'nopass'): ?>
  <main class="login"><h1>Панель заявок</h1><p class="warn">Пароль панели ещё не задан. Добавьте секрет <b>ADMIN_PASSWORD</b> в GitHub (Settings → Secrets and variables → Actions) — после следующей выкладки панель откроется.</p></main>
<?php elseif ($view === 'login'): ?>
  <main><form class="login" method="post">
    <h1 style="margin:0">Заявки · Чай + DJ</h1>
    <?php if ($err): ?><p class="warn"><?= h($err) ?></p><?php endif; ?>
    <label>Пароль<input type="password" name="password" autocomplete="current-password" autofocus required></label>
    <?php if (!empty($_GET['lead'])): ?><input type="hidden" name="lead" value="<?= (int)$_GET['lead'] ?>"><?php endif; ?>
    <button class="btn brass" type="submit">Войти</button>
  </form></main>
<?php else: ?>
  <header>
    <b>Заявки · Чай + DJ</b>
    <nav>
      <a href="<?= h($self) ?>" class="<?= !$lead && $tab !== 'tg' ? 'on' : '' ?>">Заявки</a>
      <a href="<?= h($self) ?>?tab=tg" class="<?= $tab === 'tg' ? 'on' : '' ?>">Telegram</a>
      <a href="<?= h($self) ?>?act=csv">Скачать CSV</a>
      <a href="<?= h($self) ?>?act=logout">Выйти</a>
    </nav>
  </header>
  <main>
  <?php if ($lead): $p = json_decode($lead['params'] ?: '{}', true) ?: []; ?>
    <p><a href="<?= h($self) ?>">← Все заявки</a></p>
    <?php if (!empty($_GET['saved'])): ?><p class="ok">Сохранено.</p><?php endif; ?>
    <div class="card">
      <div class="box">
        <h2><?= h($lead['code']) ?> · <?= h($lead['name']) ?></h2>
        <div class="acts">
          <a class="btn brass" href="<?= h($phoneHref((string)$lead['contact'])) ?>"><?= $lead['contact'][0] === '@' ? 'Написать в Telegram' : 'Позвонить' ?>: <?= h($lead['contact']) ?></a>
          <?php if ($lead['email']): ?><a class="btn ghost" href="mailto:<?= h($lead['email']) ?>"><?= h($lead['email']) ?></a><?php endif; ?>
        </div>
        <dl>
          <dt>Получена</dt><dd><?= h(date('d.m.Y H:i', strtotime($lead['created_at']))) ?></dd>
          <?php foreach ($p as $k => $v): ?><dt><?= h((string)$k) ?></dt><dd><?= h((string)$v) ?></dd><?php endforeach; ?>
          <?php if ($lead['utm'] && $lead['utm'] !== '[]'): ?><dt>UTM</dt><dd><?= h($lead['utm']) ?></dd><?php endif; ?>
        </dl>
      </div>
      <div style="display:grid;gap:16px">
        <form class="box" method="post">
          <input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="act" value="save"><input type="hidden" name="id" value="<?= (int)$lead['id'] ?>">
          <label>Статус<select name="status"><?php foreach (STATUSES as $k => $v): ?><option value="<?= $k ?>"<?= $lead['status'] === $k ? ' selected' : '' ?>><?= h($v) ?></option><?php endforeach; ?></select></label>
          <label>Заметка<textarea name="note" placeholder="Договорились созвониться, площадка, бюджет…"><?= h($lead['note']) ?></textarea></label>
          <button class="btn" type="submit">Сохранить</button>
        </form>
        <div class="box"><b>История</b><ul class="log"><?php foreach ($logRows as $l): ?><li><?= h(date('d.m H:i', strtotime($l['at']))) ?> — <?= h($l['text']) ?></li><?php endforeach; ?></ul></div>
        <form method="post" onsubmit="return this.querySelector('[name=really]').checked">
          <input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="act" value="delete"><input type="hidden" name="id" value="<?= (int)$lead['id'] ?>">
          <label style="font-weight:400;display:flex;gap:8px;align-items:center"><input type="checkbox" name="really" style="width:auto"> Клиент попросил удалить свои данные</label>
          <button class="btn danger" type="submit" style="margin-top:8px">Удалить заявку навсегда</button>
        </form>
      </div>
    </div>
  <?php elseif ($tab === 'tg'): ?>
    <h1 style="margin-top:0">Уведомления в Telegram</h1>
    <?php if (!empty($_GET['linked'])): ?><p class="ok">Чат подключён — в него пришло проверочное сообщение.</p><?php endif; ?>
    <?php if (isset($_GET['test'])): ?><p class="<?= $_GET['test'] ? 'ok' : 'warn' ?>"><?= $_GET['test'] ? 'Проверка отправлена.' : 'Не получилось отправить — подключите чат ниже.' ?></p><?php endif; ?>
    <?php if (empty(cfg()['tg_token'])): ?>
      <p class="warn">Бот ещё не задан. Создайте бота в @BotFather и добавьте его токен секретом <b>TG_BOT_TOKEN</b> в GitHub — после выкладки здесь появится подключение.</p>
    <?php else: ?>
      <div class="box">
        <b>Подключённые чаты</b>
        <?php if (!tg_chats()): ?><p class="warn">Пока ни одного. Откройте своего бота в Telegram и нажмите «Start» (или добавьте бота в рабочую группу), затем обновите эту страницу.</p><?php endif; ?>
        <?php foreach ($tgChats as $cid => $title): ?>
          <form method="post" class="acts" style="align-items:center"><input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="act" value="tg_unlink"><input type="hidden" name="chat" value="<?= h((string)$cid) ?>">
            <span><?= h($title ?: (string)$cid) ?></span><button class="btn ghost" type="submit">Отключить</button></form>
        <?php endforeach; ?>
        <?php foreach ($tgFound as $cid => $title): if (isset($tgChats[$cid])) continue; ?>
          <form method="post" class="acts" style="align-items:center"><input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="act" value="tg_link"><input type="hidden" name="chat" value="<?= h($cid) ?>"><input type="hidden" name="title" value="<?= h($title) ?>">
            <span>Найден чат: <b><?= h($title) ?></b></span><button class="btn brass" type="submit">Подключить</button></form>
        <?php endforeach; ?>
        <?php if (tg_chats()): ?><form method="post"><input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="act" value="tg_test"><button class="btn" type="submit">Отправить проверку</button></form><?php endif; ?>
      </div>
      <p style="color:var(--muted)">В Telegram уходят номер заявки и параметры вечера. Имя и телефон — только здесь, в панели (хранение персональных данных в России, 152-ФЗ).</p>
    <?php endif; ?>
  <?php else: $f = $_GET['s'] ?? 'open'; $q = (string)($_GET['q'] ?? ''); $total = array_sum($counts); ?>
    <?php if (!empty($_GET['deleted'])): ?><p class="ok">Заявка удалена.</p><?php endif; ?>
    <nav class="chips" aria-label="Фильтр">
      <a href="?s=open" class="<?= $f === 'open' ? 'on' : '' ?>">Активные<small><?= $total - ($counts['done'] ?? 0) - ($counts['lost'] ?? 0) ?></small></a>
      <?php foreach (STATUSES as $k => $v): ?><a href="?s=<?= $k ?>" class="<?= $f === $k ? 'on' : '' ?>"><?= h($v) ?><small><?= $counts[$k] ?? 0 ?></small></a><?php endforeach; ?>
      <a href="?s=all" class="<?= $f === 'all' ? 'on' : '' ?>">Все<small><?= $total ?></small></a>
    </nav>
    <form class="search" method="get"><input type="hidden" name="s" value="<?= h($f) ?>"><input type="search" name="q" value="<?= h($q) ?>" placeholder="Имя, телефон, номер заявки, заметка" aria-label="Поиск"><button class="btn" type="submit">Найти</button></form>
    <?php if (!$list): ?>
      <p class="empty"><?= $total ? 'По этому фильтру заявок нет.' : 'Заявок пока нет. Как только кто-то оставит заявку на сайте, она появится здесь, а в Telegram придёт уведомление.' ?></p>
    <?php else: ?>
      <div class="list">
        <?php foreach ($list as $r): ?>
          <a class="row" href="?lead=<?= (int)$r['id'] ?>">
            <span class="meta"><span class="code"><?= h($r['code']) ?></span><br><span class="when"><?= h(date('d.m H:i', strtotime($r['created_at']))) ?></span></span>
            <span><span class="who"><?= h($r['name']) ?></span> · <?= h($r['contact']) ?><br><span class="what"><?= h(implode(' · ', array_filter([FORMATS[$r['fmt']] ?? '', $r['mood'], $r['guests'] ? $r['guests'] . ' гостей' : '', $r['event_date'] ? date('d.m.Y', strtotime($r['event_date'])) : '']))) ?: 'Формат не выбран' ?></span></span>
            <span class="pill <?= h($r['status']) ?>"><?= h(STATUSES[$r['status']] ?? $r['status']) ?></span>
          </a>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
  <?php endif; ?>
  </main>
<?php endif; ?>
</body>
</html>
