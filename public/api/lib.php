<?php
/**
 * Общее для приёма заявок и панели: настройки, база заявок (SQLite), Telegram.
 * База и служебные файлы лежат ВНЕ папки сайта (…/eventchai-private), чтобы их нельзя было скачать по ссылке.
 */
declare(strict_types=1);

function cfg(): array {
  static $c = null;
  if ($c === null) {
    $f = __DIR__ . '/config.php';
    $c = is_file($f) ? (require $f) : [];
    if (!is_array($c)) $c = [];
  }
  return $c;
}

/** Папка для базы: из настроек или рядом с папкой www, вне публичной части сайта. */
function private_dir(): string {
  $c = cfg();
  $dir = $c['private_dir'] ?? '';
  if (!$dir) {
    $home = dirname(__DIR__, 3);               // …/www/<сайт>/api → домашняя папка
    $dir = is_writable($home) ? $home . '/eventchai-private' : __DIR__ . '/private';
  }
  if (!is_dir($dir)) @mkdir($dir, 0700, true);
  if (str_starts_with($dir, __DIR__) && !is_file($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\n");
  return rtrim($dir, '/');
}

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $pdo = new PDO('sqlite:' . private_dir() . '/leads.sqlite', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  $pdo->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=4000;');
  $pdo->exec("CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT,
    kind TEXT, name TEXT, contact TEXT, email TEXT,
    fmt TEXT, mood TEXT, guests INTEGER, event_date TEXT,
    estimate INTEGER DEFAULT 0, params TEXT, utm TEXT, page TEXT,
    status TEXT NOT NULL DEFAULT 'new', note TEXT DEFAULT ''
  )");
  $pdo->exec("CREATE TABLE IF NOT EXISTS lead_log (id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id INTEGER, at TEXT, text TEXT)");
  $pdo->exec("CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)");
  $pdo->exec("CREATE INDEX IF NOT EXISTS leads_status ON leads(status)");
  return $pdo;
}

function setting(string $k, ?string $v = null): ?string {
  if ($v !== null) { db()->prepare('INSERT INTO settings(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')->execute([$k, $v]); return $v; }
  $st = db()->prepare('SELECT v FROM settings WHERE k = ?'); $st->execute([$k]);
  $r = $st->fetchColumn(); return $r === false ? null : (string)$r;
}

const STATUSES = [
  'new' => 'Новая', 'work' => 'В работе', 'quote' => 'Смета отправлена',
  'deal' => 'Договор', 'done' => 'Проведено', 'lost' => 'Отказ',
];
const FORMATS = ['teadj' => 'Чай + DJ', 'tea' => 'Чайная церемония', 'dj' => 'DJ-сет', 'mk' => 'Мастер-класс', 'cert' => 'Сертификат'];

function now_tz(): DateTime { return new DateTime('now', new DateTimeZone(cfg()['timezone'] ?? 'Asia/Yekaterinburg')); }

function site_origin(): string {
  $host = $_SERVER['HTTP_HOST'] ?? '';
  return $host ? 'https://' . $host : (cfg()['site_url'] ?? '');
}

/** Чаты Telegram: из настроек сервера и подключённые в панели. */
function tg_chats(): array {
  $c = cfg();
  $ids = array_filter(array_map('strval', (array)($c['tg_chat_id'] ?? [])));
  $saved = setting('tg_chats');
  if ($saved) foreach (json_decode($saved, true) ?: [] as $id => $title) $ids[] = (string)$id;
  return array_values(array_unique(array_filter($ids)));
}

function tg_call(string $method, array $body = []): array {
  $token = cfg()['tg_token'] ?? '';
  if (!$token) return [0, null];
  $ch = curl_init('https://api.telegram.org/bot' . $token . '/' . $method);
  curl_setopt_array($ch, [
    CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 4,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
  ]);
  $res = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  return [$code, $res ? json_decode((string)$res, true) : null];
}

function tg_send(string $text, ?array $button = null): bool {
  $ok = false;
  foreach (tg_chats() as $chat) {
    $body = ['chat_id' => $chat, 'text' => $text, 'disable_web_page_preview' => true];
    if ($button) $body['reply_markup'] = ['inline_keyboard' => [[$button]]];
    [$code] = tg_call('sendMessage', $body);
    $ok = $ok || $code === 200;
  }
  return $ok;
}

function h(?string $s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
