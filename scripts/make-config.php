<?php
// Собирает api/config.php из переменных окружения выкладки (секреты GitHub). Пароль панели — только хешем.
$e = fn($k) => trim((string)getenv($k));
$host = parse_url($e('SITE_URL') ?: 'https://xn--80adjrs4a9a5b.xn--p1ai', PHP_URL_HOST);
$cfg = [
  'site_url' => $e('SITE_URL'),
  'admin_password_hash' => $e('ADMIN_PASSWORD') !== '' ? password_hash($e('ADMIN_PASSWORD'), PASSWORD_DEFAULT) : '',
  'tg_token' => $e('TG_BOT_TOKEN'),
  'tg_chat_id' => array_values(array_filter(array_map('trim', explode(',', $e('TG_CHAT_ID'))))),
  'tg_include_contacts' => false,
  'amo_domain' => $e('AMO_DOMAIN'),
  'amo_token' => $e('AMO_TOKEN'),
  'amo_pipeline_id' => 0,
  'amo_status_id' => 0,
  'mail_to' => $e('LEAD_EMAIL'),
  'mail_from' => 'noreply@' . $host,
  'send_client_copy' => true,
  'timezone' => 'Asia/Yekaterinburg',
  'tz_label' => 'по Екатеринбургу',
  'work_from' => 10,
  'work_to' => 21,
  'reply_minutes' => 30,
  'night_reply_by' => 11,
];
echo "<?php\n// Создано при выкладке из секретов GitHub. Не редактируйте на сервере — перезапишется.\nreturn " . var_export($cfg, true) . ";\n";
