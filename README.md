# Resume Atelier Web

Frontend-only веб-сервис, который адаптирует ваше резюме (DOCX или PDF) под конкретную
вакансию с учётом ATS, без выдумывания опыта. Всё вычисляется в браузере; для
LLM-этапов используется [fal.ai](https://fal.ai/).

- Приём резюме: **DOCX** (через [`mammoth`](https://www.npmjs.com/package/mammoth)) и **PDF** с OCR для сканов / картинок (через [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) + [`tesseract.js`](https://www.npmjs.com/package/tesseract.js); поддерживает `eng`, `ukr`, `rus`)
- Робастный fetch вакансий по URL — **DOU, Djinni, LinkedIn, Indeed, work.ua, rabota.ua, Greenhouse, Lever** и пр. с site-специфичными селекторами и multi-proxy fallback (CORS)
- LLM-пайплайн: `Extract Facts → Analyze Vacancy → Map Evidence → Rewrite → ATS Audit → Gap Assist`
- **Строгая ATS-рубрика**: штраф за каждое неподтверждённое требование, отсутствие education, уровня языка, отсутствующие tools; детерминированный post-process, чтобы LLM не «завышал» оценку
- Item-level diff для Skills (pill-chips) и line-paired diff для bullets — никаких склеек вроде `ПСфобрмудував`
- Красивый ATS-дружественный шаблон для экспорта: **DOCX** (двухколоночные skills, аккуратная типографика, footer с номером страницы) и **PDF** (через системный диалог «Сохранить как PDF»)
- Три языка результата: `English`, `Ukrainian`, `Russian`
- Четыре режима: `Standard`, `Safe`, `Aggressive`, `Adapt Safely`

---

## Быстрый старт — клонировать с GitHub

```bash
git clone https://github.com/Virt92/resume-atelier-web.git
cd resume-atelier-web
npm install
npm run dev
```

Dev-сервер запустится на `http://localhost:5173`. При первом запуске откройте
**Settings** и вставьте ваш `fal.ai` API ключ
(https://fal.ai/dashboard/keys) — он хранится только в `localStorage`.

### Production-сборка

```bash
npm run build
npx serve dist
```

Папка `dist/` — это полностью статический бандл, который можно залить куда
угодно (Netlify, Vercel, GitHub Pages, Cloudflare Pages, S3, собственный
сервер). Работает офлайн после первой загрузки (если не считать вызовов
fal.ai и опциональных CORS-прокси).

### Встроить API-ключ в сборку (опционально)

Скопируйте `.env.example` → `.env.local`:

```
VITE_FAL_KEY=<ваш-fal-ключ>
VITE_FAL_MODEL=google/gemini-flash-1.5-8b
```

После `npm run build` ключ будет зашит в бандл — пользователям ничего вводить
не придётся. ⚠️ **ВНИМАНИЕ:** ключ виден любому, кто откроет сайт (DevTools →
Network). Используйте только для личных сборок / локального запуска с
доверенным кругом.

---

## Запуск из архива (без Node)

В архивах `resume-atelier-web-static.zip` / `resume-atelier-web-source.zip`
лежит готовая `dist/` папка. Поскольку современные ES-модули не грузятся по
`file://`, нужен локальный HTTP-сервер.

### Вариант 1 — Node.js

```bash
npx serve dist        # http://localhost:3000
```

### Вариант 2 — Python 3

```bash
cd dist
python3 -m http.server 5173
```

### Вариант 3 — скрипты

В архиве есть `start.sh` (Linux/macOS) и `start.bat` (Windows), которые сами
запускают сервер через Node или Python — что найдут.

---

## Как работает pipeline

1. **Parse** — достаём чистый текст из DOCX/PDF. Для PDF без текстового слоя
   автоматически рендерим каждую страницу в canvas и прогоняем через
   `tesseract.js` (WASM-OCR). Язык подбирается по эвристике (ukr / rus / eng).
2. **Extract Facts** — LLM структурирует резюме в JSON: имя, контакты,
   experience, education, skills, languages, certifications, projects.
3. **Analyze Vacancy** — LLM разбирает текст вакансии: must-have, tools,
   domain-термины, требования к языку, knock-out сигналы.
4. **Map Evidence** — LLM классифицирует каждое требование как `direct` /
   `indirect` / `unsupported` и указывает, какие секции можно переписывать.
5. **Rewrite** — LLM пишет новый summary, skills, bullets последней роли, не
   выдумывая компании / годы / технологии.
6. **ATS Audit** — строгая рубрика (см. ниже) + детерминированный post-process.
7. **Gap Assist** — что можно честно усилить и что пользователю нужно добавить
   самому (если это правда).

## Рубрика ATS-оценки

Стартуем со 100 и вычитаем:

| Штраф | За что |
|:---:|:---|
| −8 | за каждое must-have, которое **не** подтверждается в резюме |
| −3 | за каждый tool из вакансии, которого нет в резюме |
| −10 | если в вакансии есть language requirements, а уровень языка не указан |
| −8 | если вакансия требует образования, а в резюме education пустой |
| −5 | если указан yearsRequired, и стаж ему не соответствует |
| −2 (до −15) | за каждый `unsupported` evidence item |
| −5 | если summary короче 30 слов |

Score фиксируется в диапазоне 0..100. LLM self-reported score используется
только если он **ниже** расчётного (то есть LLM заметил что-то, что мы
пропустили) — иначе берём расчётное значение. Все штрафы видны в сайдбаре
(«How we got there»).

---

## Fetch вакансии по URL

Нажмите «Fetch» после ввода URL — сервис попробует:

1. Прямой `fetch` (работает только для очень либеральных сайтов).
2. Прокси: `r.jina.ai` → `allorigins.win` → `codetabs.com` →
   `cors.isomorphic-git.org`. Берётся первый, который вернул достаточно
   контента.
3. Site-специфичные селекторы для DOU, Djinni, LinkedIn, Indeed, work.ua,
   rabota.ua, Greenhouse, Lever; общий readability-lite fallback для
   остальных.

Если всё равно не вышло — просто скопируйте текст вакансии в textarea.

---

## Стек

- Vue 3 + TypeScript, Pinia
- Vite 8, Tailwind CSS 3
- `mammoth`, `docx`, `file-saver`
- `pdfjs-dist` + `tesseract.js` (OCR)
- `diff` (word-diff)

---

## Структура проекта

```
src/
  App.vue                     # Лэйаут и оркестрация сценария
  main.ts                     # Точка входа
  style.css                   # Tailwind + кастомные классы
  types.ts                    # Общие TS-типы
  components/
    AppHeader.vue
    UploadDropzone.vue        # DnD / выбор DOCX или PDF
    VacancyInput.vue          # URL-fetch + textarea
    SettingsModal.vue         # API-ключ, модель, язык, режим
    PipelineProgress.vue      # Прогресс по стадиям
    ResultView.vue            # Preview + сайдбар + кнопки экспорта
    DiffSpan.vue              # Word-level diff
    DiffList.vue              # Item-level diff (skills → pills)
    DiffBullets.vue           # Bullet-paired diff (experience)
  services/
    falClient.ts              # HTTP-клиент к fal.ai any-llm
    docxReader.ts             # mammoth-based извлечение
    pdfReader.ts              # pdf.js + tesseract OCR fallback
    docxWriter.ts             # docx-based генерация красивого резюме
    vacancyFetcher.ts         # Multi-proxy + site-selectors
    prompts.ts                # Промпты всех стадий (включая строгий ATS)
    pipeline.ts               # Вызовы LLM + детерминированный ATS
    diffText.ts               # Word / list / bullet-pair diff
    runner.ts                 # Оркестрация всего пайплайна
  stores/
    session.ts                # Pinia: настройки, состояние, стадии
```

---

## Ограничения текущей версии

- OCR-язык подбирается эвристикой по первому проходу; для нестандартных алфавитов (арабский, китайский, иврит и т.п.) нужно добавить язык в `ocrLangCodes` в `src/services/pdfReader.ts`.
- Публичные CORS-прокси работают без гарантий — при падении всех четырёх проще всего вставить текст вакансии руками.
- Экспортный DOCX — это красивый ATS-дружественный шаблон, **а не 1-в-1** исходный макет пользователя (это сознательно: в ATS-юзкейсе важнее парсинг, чем сохранение дизайна).
- Все LLM-вызовы идут напрямую из браузера к fal.ai. Для публичного хостинга рекомендуется добавить backend-прокси (в текущей версии этого нет).
- Нет личного кабинета, истории генераций, биллинга, rate-limiting.

---

## Принципы адаптации

1. Не выдумывать опыт, компании, сертификаты, годы, домены, портфолио.
2. Не копировать вакансию слово в слово.
3. Сохранять даты, названия компаний, должности, степени.
4. Усиливать wording только там, где есть подтверждение в резюме.
5. При сильном mismatch использовать режим **Adapt Safely** — честно показать
   transferable skills, не придумывая недостающий домен.

---

## Лицензия

MIT.
