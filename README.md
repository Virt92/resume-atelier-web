# Resume Atelier Web

Frontend-only веб-сервис, который адаптирует ваше DOCX-резюме под конкретную
вакансию с учётом ATS, без выдумывания опыта. Всё вычисляется в браузере; для
LLM-этапов используется [fal.ai](https://fal.ai/).

- Парсинг DOCX через [`mammoth`](https://www.npmjs.com/package/mammoth)
- LLM-пайплайн: `Extract Facts → Analyze Vacancy → Map Evidence → Rewrite → ATS Audit → Gap Assist`
- Diff-подсветка изменений, список неподтверждённых требований, safe-adaptation советы
- Экспорт в **DOCX** (библиотека [`docx`](https://www.npmjs.com/package/docx)) и **PDF** (через системный диалог «Сохранить как PDF»)
- Три языка результата: `English`, `Ukrainian`, `Russian`
- Четыре режима: `Standard`, `Safe`, `Aggressive`, `Adapt Safely`

---

## Быстрый старт (если вы скачали готовый архив)

Архив содержит готовую статику в папке `dist/`. Поскольку современные ES-модули
не грузятся по протоколу `file://`, нужно отдать файлы через локальный
HTTP-сервер.

### Вариант 1 — Node.js (рекомендуется)

Требуется Node.js 18+:

```bash
npx serve dist
# или
npx http-server dist -p 5173
```

Откройте URL, который выведет утилита (обычно `http://localhost:3000`).

### Вариант 2 — Python

Если есть Python 3:

```bash
cd dist
python3 -m http.server 5173
```

Откройте `http://localhost:5173`.

### Вариант 3 — любое статическое хранилище

Залейте содержимое `dist/` на любой статический хостинг (Netlify, Vercel,
GitHub Pages, Cloudflare Pages, S3) — работает из коробки.

### Настройка API-ключа

При первом запуске нажмите **Settings** в правом верхнем углу и вставьте ваш
ключ `fal.ai`. Он хранится только в `localStorage` браузера. Получить ключ
можно в дашборде fal.ai: https://fal.ai/dashboard/keys

Если ключ вшит в сборку через `VITE_FAL_KEY` (см. ниже), пользователю ничего
вводить не нужно.

---

## Разработка (если вы клонировали репозиторий)

Требуется Node.js 18+.

```bash
npm install
npm run dev
```

Dev-сервер запустится на `http://localhost:5173`.

### Сборка production

```bash
npm run build
```

Результат попадёт в папку `dist/` и будет пригоден для статической раздачи.

### Встроить API-ключ в сборку

Скопируйте `.env.example` → `.env.local` и заполните:

```
VITE_FAL_KEY=<ваш-fal-ключ>
VITE_FAL_MODEL=google/gemini-flash-1.5-8b
```

После `npm run build` ключ будет зашит в бандл, и пользователям не придётся
вводить свой. ⚠️ **ВНИМАНИЕ:** ключ виден любому, кто открывает сайт
(DevTools → Network). Используйте только для личных сборок / локального
запуска.

### Превью production-сборки

```bash
npm run preview
```

---

## Стек

- Vue 3 + TypeScript
- Vite 8
- Pinia (состояние)
- Tailwind CSS 3
- `mammoth` (парсинг DOCX)
- `docx` (генерация DOCX)
- `diff` (word-level diff)
- `file-saver`

---

## Структура проекта

```
src/
  App.vue                 # Лэйаут и оркестрация сценария
  main.ts                 # Точка входа
  style.css               # Tailwind + кастомные классы
  types.ts                # Общие TS-типы
  components/
    AppHeader.vue
    UploadDropzone.vue    # DnD / выбор DOCX
    VacancyInput.vue      # URL + textarea
    SettingsModal.vue     # API-ключ, модель, язык, режим
    PipelineProgress.vue  # Прогресс по 6 стадиям
    ResultView.vue        # Preview + сайдбар + кнопки экспорта
    DiffSpan.vue          # Word-level diff подсветка
  services/
    falClient.ts          # HTTP-клиент к fal.ai any-llm
    docxReader.ts         # mammoth-based извлечение
    docxWriter.ts         # docx-based генерация
    prompts.ts            # Промпты всех стадий
    pipeline.ts           # Вызовы LLM по стадиям
    diffText.ts           # Обёртка над diffWordsWithSpace
    runner.ts             # Оркестрация: запуск всего пайплайна
  stores/
    session.ts            # Pinia: настройки, состояние, стадии
```

---

## Ограничения текущей версии

- Поддерживается только вход `DOCX`. `PDF`-резюме не принимаются (плохо извлекается текст и разметка).
- URL-вытягивание вакансий в большинстве случаев блокируется CORS — вставляйте текст вакансии вручную.
- Экспортный DOCX генерируется с чистой разметкой, а не 1-в-1 повторяет ваш исходный шаблон. Полное сохранение сложного дизайнерского шаблона требует редактирования на backend-слое (см. ТЗ §17).
- Все вызовы LLM идут напрямую из браузера к fal.ai. Для публичного хостинга рекомендуется добавить backend-прокси (в текущей версии этого нет).
- Нет личного кабинета, истории генераций, биллинга.

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
