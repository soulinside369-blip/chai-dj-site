<?php
/**
 * Приём заявок «Чай + DJ» (раздел 7 ТЗ).
 * 1) Заявка сразу пишется в private/leads.csv — ни одна не теряется.
 * 2) Telegram-бот: номер заявки и параметры (контакты — только если tg_include_contacts = true, см. 152-ФЗ).
 * 3) amoCRM: сделка + контакт + примечание со всеми полями и UTM.
 * 4) Почта: копия каждой заявки; если Telegram или CRM не ответили — письмо с пометкой «РЕЗЕРВ».
 * 5) Письмо-подтверждение клиенту, если он оставил почту.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex');

function out(int $code, array $data): void { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, ['ok' => false, 'error' => 'method']);

$cfgFile = __DIR__ . '/config.php';
if (!is_file($cfgFile)) out(500, ['ok' => false, 'error' => 'config']);
$cfg = require $cfgFile;

$privateDir = rtrim($cfg['private_dir'] ?? (__DIR__ . '/private'), '/');
if (!is_dir($privateDir)) @mkdir($privateDir, 0700, true);

/* ---------- Ввод и проверка ---------- */
$raw = file_get_contents('php://input') ?: '';
if (strlen($raw) > 20000) out(413, ['ok' => false, 'error' => 'too_large']);
$in = json_decode($raw, true);
if (!is_array($in)) out(400, ['ok' => false, 'error' => 'json']);

if (!empty($in['website'])) out(200, ['ok' => true, 'id' => 'ЧД-0', 'replyBy' => '']); // ловушка для ботов

$s = fn($k, $max = 300) => mb_substr(trim(strip_tags((string)($in[$k] ?? ''))), 0, $max);
$name = $s('name', 80);
$contact = $s('contact', 64);
$email = $s('email', 120);
$comment = $s('comment', 2000);
$kind = $in['kind'] === 'calc' ? 'calc' : 'quick';
$fmtKey = $s('fmt', 16);

$digits = preg_replace('/\D/', '', $contact);
$okContact = preg_match('/^@[a-z0-9_]{4,32}$/i', $contact) || strlen($digits) === 11;
$errors = [];
if (mb_strlen($name) < 2) $errors['name'] = 'Как к вам обращаться?';
if (!$okContact) $errors['contact'] = 'Нужен номер из 11 цифр или ник вида @name';
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Проверьте адрес почты';
if (empty($in['consent'])) $errors['consent'] = 'Нужно согласие на обработку данных';
if ($errors) out(422, ['ok' => false, 'error' => 'validation', 'fields' => $errors]);

/* ---------- Простая защита от частых отправок: 1 заявка в 20 с с одного IP ---------- */
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';
$rlFile = $privateDir . '/rl_' . md5($ip);
if (is_file($rlFile) && time() - (int)@file_get_contents($rlFile) < 20) out(429, ['ok' => false, 'error' => 'rate']);
@file_put_contents($rlFile, (string)time());

/* ---------- Номер заявки и срок ответа ---------- */
$tz = new DateTimeZone($cfg['timezone'] ?? 'Asia/Yekaterinburg');
$now = new DateTime('now', $tz);
$counterFile = $privateDir . '/counter.txt';
$fp = fopen($counterFile, 'c+');
flock($fp, LOCK_EX);
$n = (int)stream_get_contents($fp) + 1;
ftruncate($fp, 0); rewind($fp); fwrite($fp, (string)$n); fflush($fp); flock($fp, LOCK_UN); fclose($fp);
$id = 'ЧД-' . $now->format('ymd') . '-' . str_pad((string)$n, 3, '0', STR_PAD_LEFT);

$from = (int)($cfg['work_from'] ?? 10); $to = (int)($cfg['work_to'] ?? 21);
$h = (int)$now->format('G') + (int)$now->format('i') / 60;
$tzLabel = $cfg['tz_label'] ?? 'по Екатеринбургу';
if ($h >= $from && $h < $to) {
  $t = (clone $now)->modify('+' . (int)($cfg['reply_minutes'] ?? 30) . ' minutes');
  $replyBy = 'Ответим сегодня до ' . $t->format('H:i') . ' ' . $tzLabel;
} else {
  $replyBy = 'Ответим ' . ($h < $from ? 'сегодня' : 'завтра') . ' до ' . (int)($cfg['night_reply_by'] ?? 11) . ':00 ' . $tzLabel;
}

/* ---------- Сводка ---------- */
$fmtNames = ['teadj' => 'Чай + DJ', 'tea' => 'Чайная церемония', 'dj' => 'DJ-сет', 'mk' => 'Мастер-класс', 'cert' => 'Сертификат'];
$money = fn($v) => number_format((float)$v, 0, ',', ' ') . ' ₽';
$params = ['Форма' => $kind === 'calc' ? 'калькулятор' : 'быстрая заявка', 'Формат' => $fmtNames[$fmtKey] ?? 'не выбран'];
$estimateTotal = 0;
if ($kind === 'calc') {
  if ($fmtKey === 'cert') {
    $params['Номинал'] = $money($in['cert'] ?? 0);
    $estimateTotal = (int)($in['cert'] ?? 0);
  } else {
    $params['Дата'] = $s('date', 10);
    $params['Место'] = $s('town', 60) . (!empty($in['km']) ? ' (' . (int)$in['km'] . ' км)' : '');
    $params['Гостей'] = (string)(int)($in['guests'] ?? 0);
    $params['Часов'] = str_replace('.', ',', (string)(float)($in['hours'] ?? 0));
    $params['Площадка'] = ($in['place'] ?? '') === 'out' ? 'улица' : 'помещение';
    $params['220 В'] = ['yes' => 'есть', 'no' => 'нет — нужен генератор', 'unknown' => 'не знают'][$in['power'] ?? ''] ?? '—';
    $est = $in['estimate'] ?? null;
    if (is_array($est)) { $params['Оценка'] = $money($est['low']) . ' – ' . $money($est['high']); $estimateTotal = (int)$est['total']; }
    else $params['Оценка'] = 'индивидуальный расчёт';
  }
}
if ($comment !== '') $params['Комментарий'] = $comment;
$utm = is_array($in['utm'] ?? null) ? array_map(fn($v) => mb_substr((string)$v, 0, 120), $in['utm']) : [];
$source = $utm ? implode(', ', array_map(fn($k, $v) => "$k=$v", array_keys($utm), $utm)) : ('реферер: ' . mb_substr((string)($in['ref'] ?? '—'), 0, 200));
$params['Источник'] = $source;
$params['Страница'] = mb_substr((string)($in['page'] ?? ''), 0, 120);

$contactLines = ['Имя' => $name, 'Контакт' => $contact] + ($email !== '' ? ['Почта' => $email] : []);
$fmtLines = function (array $a): string { $r = ''; foreach ($a as $k => $v) $r .= "$k: $v\n"; return $r; };

/* ---------- 1. Резервная запись ---------- */
$csv = $privateDir . '/leads.csv';
$isNew = !is_file($csv);
if ($f = @fopen($csv, 'a')) {
  if ($isNew) fputcsv($f, ['id', 'time', 'name', 'contact', 'email', 'params', 'utm']);
  fputcsv($f, [$id, $now->format('Y-m-d H:i'), $name, $contact, $email, json_encode($params, JSON_UNESCAPED_UNICODE), json_encode($utm, JSON_UNESCAPED_UNICODE)]);
  fclose($f);
}

function http_json(string $url, array $body, array $headers = []): array {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 4,
    CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
    CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
  ]);
  $res = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  return [$code, $res ? json_decode((string)$res, true) : null];
}

/* ---------- 2. Telegram ---------- */
$tgOk = false;
if (!empty($cfg['tg_token']) && !empty($cfg['tg_chat_id'])) {
  $text = "🫖 Заявка $id\n" . $fmtLines($params);
  $text .= !empty($cfg['tg_include_contacts']) ? "\n" . $fmtLines($contactLines) : "\nКонтакты — в amoCRM и на почте.";
  foreach ((array)$cfg['tg_chat_id'] as $chat) {
    [$code] = http_json('https://api.telegram.org/bot' . $cfg['tg_token'] . '/sendMessage', ['chat_id' => $chat, 'text' => $text, 'disable_web_page_preview' => true]);
    $tgOk = $tgOk || $code === 200;
  }
}

/* ---------- 3. amoCRM ---------- */
$crmOk = false;
if (!empty($cfg['amo_domain']) && !empty($cfg['amo_token'])) {
  $isTg = $contact[0] === '@';
  $contactEntity = ['first_name' => $name, 'custom_fields_values' => []];
  if (!$isTg) $contactEntity['custom_fields_values'][] = ['field_code' => 'PHONE', 'values' => [['value' => '+' . $digits, 'enum_code' => 'WORK']]];
  if ($email !== '') $contactEntity['custom_fields_values'][] = ['field_code' => 'EMAIL', 'values' => [['value' => $email, 'enum_code' => 'WORK']]];
  if (!$contactEntity['custom_fields_values']) unset($contactEntity['custom_fields_values']);
  $lead = [
    'name' => "$id · " . ($fmtNames[$fmtKey] ?? 'Заявка с сайта'),
    'price' => $estimateTotal,
    '_embedded' => ['contacts' => [$contactEntity], 'tags' => [['name' => 'сайт'], ['name' => $kind === 'calc' ? 'калькулятор' : 'быстрая заявка']]],
  ];
  if (!empty($cfg['amo_pipeline_id'])) $lead['pipeline_id'] = (int)$cfg['amo_pipeline_id'];
  if (!empty($cfg['amo_status_id'])) $lead['status_id'] = (int)$cfg['amo_status_id'];
  $auth = ['Authorization: Bearer ' . $cfg['amo_token']];
  [$code, $res] = http_json('https://' . $cfg['amo_domain'] . '/api/v4/leads/complex', [$lead], $auth);
  if ($code === 200 && !empty($res[0]['id'])) {
    $crmOk = true;
    $note = "Заявка $id\n" . $fmtLines($contactLines) . $fmtLines($params);
    if ($isTg) $note = "Telegram: $contact\n" . $note;
    http_json('https://' . $cfg['amo_domain'] . '/api/v4/leads/' . (int)$res[0]['id'] . '/notes', [['note_type' => 'common', 'params' => ['text' => $note]]], $auth);
  }
}

/* ---------- 4. Почта: копия и резерв ---------- */
$mailTo = $cfg['mail_to'] ?? '';
$mailFrom = $cfg['mail_from'] ?? ('noreply@' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
$enc = fn($t) => '=?UTF-8?B?' . base64_encode($t) . '?=';
$headers = "From: {$enc('Чай + DJ')} <$mailFrom>\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit";
$fallback = !$tgOk || !$crmOk;
if ($mailTo) {
  $subject = ($fallback ? '[РЕЗЕРВ] ' : '') . "Заявка $id с сайта";
  $body = $fmtLines($contactLines) . "\n" . $fmtLines($params)
    . "\nTelegram: " . ($tgOk ? 'доставлено' : 'НЕ доставлено') . "\namoCRM: " . ($crmOk ? 'сделка создана' : 'НЕ создана — создайте вручную');
  @mail($mailTo, $enc($subject), $body, $headers);
}

/* ---------- 5. Подтверждение клиенту ---------- */
if ($email !== '' && !empty($cfg['send_client_copy'])) {
  $body = "Здравствуйте, $name!\n\nМы получили вашу заявку $id. $replyBy.\n\n" . $fmtLines(array_diff_key($params, ['Источник' => 1, 'Страница' => 1, 'Форма' => 1]))
    . "\nЕсли захотите что-то уточнить — просто ответьте на это письмо.\n\nЧай + DJ";
  @mail($email, $enc("Заявка $id принята"), $body, $headers . ($mailTo ? "\r\nReply-To: $mailTo" : ''));
}

out(200, ['ok' => true, 'id' => $id, 'replyBy' => $replyBy]);
