# Frontend roadmap - generation console, identities, verification

Дата: 2026-06-12  
Статус: product/frontend roadmap, не current-state документация  
Цель: перестроить интерфейс вокруг основной ценности продукта: создание тестовой личности, получение данных и mailbox, ручное использование этих данных где угодно.

## 1. Главный продуктовый смысл

Текущий интерфейс не должен развиваться в сторону "шагового registration URL workflow" как главного сценария.

Правильная идея:

```text
Пользователь заходит в сервис
  -> создает тестового пользователя / тестовую личность
  -> получает registration data + mailbox
  -> вручную использует эти данные на любом нужном сайте
  -> возвращается в сервис, чтобы проверить inbox, links, codes
```

Это должна быть не wizard-система и не конструктор конкретного registration flow, а рабочая консоль генерации и проверки тестовой личности.

## 2. Product naming

Слово `Accounts` сейчас двусмысленное:

- accounts внутри самого сервиса;
- тестовые аккаунты/личности, которые генерируются для внешней регистрации.

Поэтому navigation и UI лучше переименовать.

Варианты:

- `Identities`;
- `Test Users`;
- `Generated Users`.

Рекомендация:

```text
Test Users
```

Почему:

- понятнее для QA/operator audience;
- не конфликтует с account внутри сервиса;
- отражает, что это созданные тестовые пользователи, а не real service users.

Дополнительно:

- `Account details` лучше заменить на `Test user details` или `Identity details`;
- `Accounts` table -> `Test Users`;
- `Recent accounts` -> `Recent test users` или `Recent identities`;
- `Create account` -> `Generate identity` или `Generate test user`.

## 3. Main page target

Main должен быть главным рабочим экраном.

Не wizard.

Не "Registration URL flow".

А:

```text
Generation console + selected identity workspace
```

Целевая структура Main:

| Зона | Что внутри |
| --- | --- |
| Top actions | Generate identity, Generate bulk, Refresh inbox, Copy pack |
| Generation panel | GEO, persona, document, bulk count |
| Recent identities | Последние созданные test users |
| Identity workspace | Выбранный профиль, данные, mailbox, verification |

## 4. Main - Top actions

Top actions должны быть короткими и рабочими:

- `Generate identity`;
- `Generate bulk`;
- `Refresh inbox`;
- `Copy pack`.

Убрать или сильно понизить:

- `Open registration URL`, пока нет реального configurable registration URL;
- любые намеки, что продукт сам ведет пользователя по конкретному registration wizard.

Лучше логика:

```text
Generate identity -> создает данные + mailbox
Copy pack -> копирует все поля
Refresh inbox -> проверяет mailbox выбранной личности
```

## 5. Main - Generation panel

Generation panel остается отдельным блоком.

Поля:

- GEO;
- persona;
- document;
- bulk count.

После backend-roadmap изменений сюда также можно добавить:

- usage limit indicator;
- workspace selector, если будет несколько workspaces;
- personal default marker, если настройки берутся из server-side user settings.

Пример:

```text
GEO: South Sudan
Persona: Standard User
Document: passport
Bulk count: 5

Usage: 12 / 25 generated today
```

## 6. Main - Recent identities

Это список последних созданных test users.

Минимальные поля:

- display name или username;
- email;
- GEO;
- compact status;
- created time.

Status должен отражать полезное состояние:

- `Generated`;
- `Inbox waiting`;
- `Email received`;
- `Verification found`.

Важно: не делать статус огромной плашкой. Он должен быть компактным chip/dot.

## 7. Main - Identity workspace

Это основной правый/центральный рабочий блок выбранной личности.

Содержимое:

- test user header;
- account/site id, если оператор вставил его вручную;
- registration data;
- mailbox credentials;
- latest message;
- parsed verification links;
- parsed codes;
- copy actions.

Лучше группировка:

```text
Test user
  - username
  - email
  - mailbox password
  - phone

Personal data
  - first name
  - last name
  - date of birth
  - gender
  - country / region / city
  - address

Document
  - type
  - value
  - issue date

Mailbox
  - latest message
  - refresh inbox

Verification
  - primary link
  - all links
  - codes
```

## 8. Navigation target

Целевая navigation:

```text
Main
Test Users
Mailboxes
Verification
Settings
```

Replace:

```text
Accounts -> Test Users
Verification Codes -> Verification
```

Rationale:

- `Test Users` не конфликтует с users сервиса;
- `Verification` включает не только numeric codes, но и links.

## 9. Test Users page

Бывшая `/accounts`.

Цель страницы:

```text
Полный список сгенерированных test users / identities
```

Содержимое:

- search;
- filters;
- GEO filter;
- status filter;
- sort;
- table/list;
- detail modal или side drawer.

Columns:

- Test user;
- GEO;
- Email;
- Status;
- Created;
- Actions.

Actions:

- Open details;
- Copy pack;
- Refresh inbox, возможно в detail;
- Delete, позже и только при подтверждении.

Naming:

- route можно оставить `/accounts` технически для backward compatibility;
- UI label лучше заменить на `Test Users`;
- позже можно добавить redirect `/test-users`.

## 10. Mailboxes page

Смысл текущей страницы правильный, ее надо не переизобретать, а доточить.

Target:

```text
Selected mailbox on top
  -> latest message
  -> parsed links/codes
  -> mailbox list below
```

Структура:

1. Selected mailbox reader сверху.
2. Latest message.
3. Parsed links.
4. Parsed codes.
5. Mailbox list/table ниже.

Для standalone mailbox:

- email;
- password;
- refresh inbox;
- latest message/codes/links.

Для generated test user mailbox:

- связан с test user;
- кнопка open test user details;
- refresh inbox.

Важно: на `/mailboxes` не должно быть generation settings и общих generator actions. Это отдельная inbox-страница.

## 11. Verification page

Переименовать:

```text
Verification Codes -> Verification
```

Почему: там должны жить не только codes, но и links.

Target contents:

- selected test user;
- primary verification link;
- all links;
- numeric codes;
- received time;
- source mailbox/message;
- copy/open actions.

Если test user не выбран:

- показать table/list test users with verification status;
- action `Open verification`.

Status options:

- `No email`;
- `Email received`;
- `Link found`;
- `Code found`;
- `Verified`, если когда-нибудь будет ручная отметка.

## 12. Settings page split

Текущий Settings - browser local settings. Дальше нужен split.

Sections:

```text
Personal Settings
Workspace Settings
Account Settings
```

### Personal Settings

Для user generation defaults:

- default GEO;
- default persona;
- default document;
- bulk count.

Backend target:

```text
user_settings
```

### Workspace Settings

Для shared workspace behavior:

- history limit;
- retention;
- max bulk count;
- allow bulk generation;
- mailbox provider;
- members, позже.

Backend target:

```text
workspace_settings
workspace_members
```

### Account Settings

Для самого пользователя сервиса:

- email;
- password;
- sessions;
- logout.

Backend target:

```text
users
sessions
```

## 13. Information architecture

Новая mental model:

```text
Service users
  -> люди, которые пользуются сервисом

Test users / identities
  -> сгенерированные личности для внешних регистраций

Mailboxes
  -> временные email ящики для test users или standalone checks

Verification
  -> links/codes/messages, найденные в mailbox
```

UI должен четко разделять service user и generated test user.

## 14. Copy behavior

Copy remains core.

Required copy actions:

- copy email;
- copy mailbox password;
- copy phone;
- copy document;
- copy full pack;
- copy personal pack;
- copy address pack;
- copy verification link;
- copy code.

Full pack should include:

```text
Username
Email
Mailbox Password
First Name
Last Name
Date of Birth
Gender
Phone
Country
Region
City
Address
Postal Code
Place of Birth
Document Type
Document Value
Document Issue Date
```

Do not rely on big text buttons in dense detail rows. Compact icon buttons are better.

## 15. Mobile / responsive expectations

Main responsive behavior:

- top actions collapse into compact grid;
- generation panel stays above recent identities;
- selected identity workspace stacks below list;
- detail rows must never wrap one character per line;
- table-heavy pages can switch to card/list layout on mobile.

Mailboxes mobile behavior:

- selected mailbox first;
- mailbox list below;
- latest message readable;
- links/codes copyable without horizontal scroll.

## 16. Implementation phases

### Phase 1 - rename and wording

- Rename UI `Accounts` -> `Test Users`.
- Rename `Verification Codes` -> `Verification`.
- Rename `Create account` -> `Generate identity` or `Generate test user`.
- Rename `Account details` -> `Test user details`.
- Remove wizard/registration-flow wording from Main.

No backend changes needed.

### Phase 2 - Main layout refinement

- Keep Main as console.
- Ensure order:
  1. top actions;
  2. generation panel;
  3. recent identities;
  4. identity workspace.
- Keep Generation panel visually separate.
- Keep Recent identities and Identity workspace clearly separated.

### Phase 3 - Mailboxes polish

- Keep selected mailbox reader on top.
- Add latest message emphasis.
- Add parsed links/codes summary.
- Keep mailbox list below.
- Keep statuses compact.

### Phase 4 - Verification page

- Rename page.
- Make selected test user verification panel.
- Show links and codes equally.
- Add source mailbox/message metadata.

### Phase 5 - Settings split

Initially UI-only split:

- Personal Settings from current local settings;
- Workspace Settings placeholders until backend is ready;
- Account Settings placeholders until auth/session backend is ready.

Then connect to backend after backend roadmap phases land.

### Phase 6 - Limits UI

After backend exposes limits:

- show usage in Main generation panel;
- show disabled states when limits are reached;
- show clear error message from typed backend error code.

## 17. Routes

Short-term:

```text
/main
/accounts       UI label: Test Users
/mailboxes
/codes          UI label: Verification
/settings
```

Later:

```text
/test-users
/verification
```

Potential migration:

- keep `/accounts` redirecting to `/test-users`;
- keep `/codes` redirecting to `/verification`;
- avoid breaking old bookmarks immediately.

## 18. Definition of done

Frontend roadmap is done when:

- Main reads as a generation console, not a wizard;
- no primary UX depends on `Registration URL`;
- generated entities are called `Test Users` or another clear identity term;
- `Accounts` no longer confuses generated users with service users;
- `/mailboxes` has selected mailbox + latest message + parsed links/codes + list;
- `Verification` handles links and codes, not only codes;
- Settings is split into personal/workspace/account sections;
- UI can later attach to backend users/workspaces/limits without another conceptual rewrite.

