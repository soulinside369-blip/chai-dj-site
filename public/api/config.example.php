<?php
// Скопируйте в config.php на сервере и заполните. config.php в репозиторий не попадает (.gitignore).
return [
  // Telegram: токен от @BotFather, chat_id — ваш личный или группы (можно массив из нескольких)
  'tg_token' => '',
  'tg_chat_id' => '',
  // false — в Telegram уходят только номер и параметры заявки, без имени и телефона (152-ФЗ, раздел 11 ТЗ)
  'tg_include_contacts' => false,

  // amoCRM: домен вида company.amocrm.ru и долгосрочный токен (Настройки → Интеграции → своя интеграция)
  'amo_domain' => '',
  'amo_token' => '',
  'amo_pipeline_id' => 0, // 0 — воронка по умолчанию
  'amo_status_id' => 0,

  // Почта: куда копия каждой заявки; от чьего имени (адрес на вашем домене)
  'mail_to' => '',
  'mail_from' => '',
  'send_client_copy' => true,

  // Рабочее время и срок ответа
  'timezone' => 'Asia/Yekaterinburg',
  'tz_label' => 'по Екатеринбургу',
  'work_from' => 10,
  'work_to' => 21,
  'reply_minutes' => 30,
  'night_reply_by' => 11,

  // Папка для leads.csv и служебных файлов. Лучше вне публичной папки сайта, например '/home/user/chai-private'
  'private_dir' => __DIR__ . '/private',
];
