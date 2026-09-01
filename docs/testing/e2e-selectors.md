# E2E-селекторы Rhythm (единая конвенция)

Версия: 1.0 · Статус: КАНОНИЧЕСКАЯ ТАБЛИЦА · Обновляется вместе с тестами.

**Шаблон имени:** `<фича>-<элемент>[-<квалификатор>]` (kebab-case, только латиница).
Атрибуты `data-testid` — тестовая инфраструктура: они не несут продуктовой
логики и не используются стилями. При переименовании элемента в UI —
обновить эту таблицу и спеки в `e2e/`.

## Сценарий 1 — check-in (ядро привычки)

| data-testid | Элемент | Компонент |
|---|---|---|
| `checkin-open` | Триггер чек-ина («+» / «Отметить состояние») | `TodayScreen` (виджет настроения), `JournalScreen` (шапка) |
| `checkin-sheet` | Контейнер листа чек-ина | `MoodCheckInSheet` |
| `mood-state-1..5` | Пять состояний 😩 😔 😐 🙂 ✨ (квалификатор = скрытый score) | `MoodCheckInSheet` |
| `checkin-save` | «Сохранить» (disabled, пока состояние не выбрано) | `MoodCheckInSheet` |
| `checkin-add-details` | «+ Добавить детали» (экспандер заметки/тегов) | `MoodCheckInSheet` |
| `checkin-note` | Поле заметки (внутри деталей) | `MoodCheckInSheet` |
| `journal-list` | Лента Journal (контейнер) | `JournalScreen` |
| `journal-entry` | Карточка записи | `JournalScreen → EntryRow` |

## Сценарий 2 — export-privacy

| data-testid | Элемент | Компонент |
|---|---|---|
| `export-csv-trigger` | Триггер экспорта CSV (иконка в шапке Journal) | `JournalScreen` |
| `export-confirm-dialog` | Диалог подтверждения экспорта | `ExportCsvDialog` (через `DialogShell.testId`) |
| `export-summary` | Текст сводки: «Экспортировать N записей за период …» | `ExportCsvDialog` |
| `export-confirm` | «Скачать CSV» (подтверждение выгрузки) | `ExportCsvDialog` |
| `export-cancel` | «Отмена» (отказ — скачивания нет) | `ExportCsvDialog` |

## Сценарий 3 — deeplink-guard

| data-testid | Элемент | Компонент |
|---|---|---|
| `not-found` | Состояние «Не найдено» (чужая/несуществующая запись, без утечки) | `JournalScreen` |

## Вход (общая инфраструктура)

| data-testid | Элемент | Компонент |
|---|---|---|
| `auth-email` | Поле почты | `AuthScreen` |
| `auth-password` | Поле пароля | `AuthScreen` |
| `auth-submit` | Кнопка входа/регистрации | `AuthScreen` |

## Вспомогательные селекторы (вне сценариев, но стабильные)

| data-testid | Элемент | Компонент |
|---|---|---|
| `auth-tab-login` / `auth-tab-signup` | Переключатель режима входа | `AuthScreen` |
| `auth-name` | Поле имени (signup) | `AuthScreen` |
| `nav-<tabId>` | Пункт навигации (desktop и mobile): `nav-today`, `nav-journal`, `nav-mood`, … | `Shell` |
| `toast-<kind>` | Тост: `toast-success`, `toast-info`, `toast-error` | `Shell → ToastHost` |

## Соглашения по использованию в тестах

- Программный логин через Supabase в `e2e/auth.setup.ts` невозможен, пока
  приложение работает в локальном демо-режиме (данные в localStorage,
  `@supabase/supabase-js` установлен, но не подключён к рантайму). Используется
  setup-проект Playwright: однократный UI-signup → `storageState` → все спеки
  стартуют залогиненными и не зависят от порядка выполнения. При переезде на
  реальный Supabase setup заменяется на `supabase.auth.signInWithPassword`
  без изменения спеков.
- Креды — из env (`E2E_EMAIL`, `E2E_PASSWORD`, в CI — секреты репозитория),
  дефолт `e2e@rhythm.test`.
- Хоткей `M` глобальный, но игнорируется в полях ввода и при модификаторах —
  это проверяется отдельным тестом в `e2e/checkin.spec.ts`.
- Запуск: `npm run test:e2e` (браузеры: `npm run test:e2e:install`).
