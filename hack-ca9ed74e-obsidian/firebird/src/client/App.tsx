import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Filter,
  Flame,
  Languages,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { MAX_DATE, MIN_DATE, type CatalogMeta, type Query, type Recommendation, type SearchResult } from '../shared/types';

type FormState = {
  city: string;
  date: string;
  format: string;
  category: string;
  budget: string;
  hours: string;
  language: string;
};

const presets: { label: string; note: string; query: FormState }[] = [
  {
    label: 'Плотная категория',
    note: 'Ведущий, осенняя дата',
    query: {
      city: 'Алматы',
      date: '2026-10-10',
      format: 'корпоратив',
      category: 'Ведущий',
      budget: '1000000',
      hours: '6',
      language: 'русский',
    },
  },
  {
    label: 'Другая дата',
    note: 'Та же заявка, другой календарь',
    query: {
      city: 'Алматы',
      date: '2026-10-17',
      format: 'корпоратив',
      category: 'Ведущий',
      budget: '1000000',
      hours: '6',
      language: 'русский',
    },
  },
  {
    label: 'Редкая категория',
    note: 'Флорист, мало профилей',
    query: {
      city: 'Алматы',
      date: '2026-10-10',
      format: 'свадьба',
      category: 'Флорист',
      budget: '300000',
      hours: '',
      language: '',
    },
  },
  {
    label: 'Нет категории',
    note: 'Декоратор в Астане',
    query: {
      city: 'Астана',
      date: '2026-10-10',
      format: 'корпоратив',
      category: 'Декоратор',
      budget: '700000',
      hours: '',
      language: '',
    },
  },
  {
    label: 'Не проходит бюджет',
    note: 'Кандидаты есть, условия жесткие',
    query: {
      city: 'Алматы',
      date: '2026-10-10',
      format: 'корпоратив',
      category: 'Ведущий',
      budget: '100000',
      hours: '6',
      language: 'русский',
    },
  },
  {
    label: 'Декабрьский пик',
    note: 'Видна роль занятости',
    query: {
      city: 'Алматы',
      date: '2026-12-12',
      format: 'корпоратив',
      category: 'Ведущий',
      budget: '1000000',
      hours: '6',
      language: 'русский',
    },
  },
];

const money = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
const dateText = (value: string) => value.split('-').reverse().join('.');

function initialForm(meta?: CatalogMeta): FormState {
  return {
    city: meta?.cities[0] ?? 'Алматы',
    date: '2026-10-10',
    format: 'корпоратив',
    category: 'Ведущий',
    budget: '1000000',
    hours: '6',
    language: 'русский',
  };
}

function toQuery(form: FormState): Query {
  return {
    city: form.city,
    date: form.date,
    format: form.format,
    category: form.category,
    budget: Number(form.budget),
    ...(form.hours.trim() ? { hours: Number(form.hours) } : {}),
    ...(form.language ? { language: form.language } : {}),
  };
}

function reasonLabel(reason: string) {
  const labels: Record<string, string> = {
    busy: 'заняты на дату',
    budget: 'дороже бюджета',
    format: 'не берут формат',
    language: 'не работают на языке',
    duration: 'не тянут длительность',
  };
  return labels[reason] ?? reason;
}

function modeLabel(mode: SearchResult['explanationMode']) {
  return mode === 'ai' ? 'AI выбрал источник' : mode === 'fallback' ? 'локальный fallback' : 'локальные правила';
}

function statusCopy(result: SearchResult) {
  if (result.status === 'matched') {
    const suffix = result.eligibleCount < 3 ? ` Подходящих меньше трех: найдено ${result.eligibleCount}.` : '';
    return `Подобрали ${result.recommendations.length} из ${result.eligibleCount} подходящих кандидатов.${suffix}`;
  }
  if (result.status === 'category_absent') {
    return `В городе ${result.query.city} нет подрядчиков категории «${result.query.category}».`;
  }
  return 'Кандидаты в этой категории есть, но ни один не прошел все условия запроса.';
}

function profileBadges(card: Recommendation, query: Query) {
  const { profile } = card;
  const badges = [`${profile.city}`, `от ${money(profile.price)} ₸`, query.format];
  if (query.language) badges.push(query.language);
  if (query.hours !== undefined) badges.push(profile.maxHours === null ? 'без ограничения часов' : `до ${profile.maxHours} ч`);
  return badges;
}

function activeReasons(result: SearchResult) {
  return Object.entries(result.reasons).filter(([, count]) => count > 0);
}

export function App() {
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [metaError, setMetaError] = useState('');
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/catalog')
      .then(async response => {
        if (!response.ok) throw new Error('Каталог недоступен');
        return response.json() as Promise<CatalogMeta>;
      })
      .then(data => {
        if (!alive) return;
        setMeta(data);
        setForm(current => ({ ...initialForm(data), ...current }));
      })
      .catch(() => {
        if (alive) setMetaError('Не удалось загрузить каталог. Проверьте, что сервер API запущен.');
      });
    return () => { alive = false; };
  }, []);

  const canSubmit = Boolean(meta && form.city && form.date && form.format && form.category && form.budget);
  const categoryOptions = useMemo(() => meta?.categories ?? [], [meta]);

  async function search(query: Query) {
    setLoading(true);
    setSubmitError('');
    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Запрос не выполнен');
      setResult(payload as SearchResult);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось выполнить подбор');
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search(toQuery(form));
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function applyPreset(next: FormState) {
    setForm(next);
    void search(toQuery(next));
  }

  return (
    <main className="app-shell">
      <section className="workbench">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark"><Flame size={22} /></span>
            <div>
              <p className="eyebrow">HackAlem · #79-lite</p>
              <h1>Умный подбор event-подрядчиков</h1>
            </div>
          </div>
          <div className="meta-strip" aria-live="polite">
            {meta ? (
              <>
                <span>{meta.count} профилей</span>
                <span>{meta.syntheticCount} synthetic</span>
                <span>{meta.aiConfigured ? 'AI включен' : 'локальный режим'}</span>
              </>
            ) : (
              <span>Загрузка каталога</span>
            )}
          </div>
        </header>

        <div className="layout">
          <aside className="query-panel">
            <div className="panel-title">
              <Filter size={18} />
              <span>Параметры заказа</span>
            </div>

            {metaError && <p className="error-line">{metaError}</p>}

            <form onSubmit={onSubmit} className="form-grid">
              <label>
                Город
                <select value={form.city} onChange={event => update('city', event.target.value)} disabled={!meta}>
                  {(meta?.cities ?? [form.city]).map(city => <option key={city}>{city}</option>)}
                </select>
              </label>

              <label>
                Дата
                <input
                  type="date"
                  min={MIN_DATE}
                  max={MAX_DATE}
                  value={form.date}
                  onChange={event => update('date', event.target.value)}
                />
              </label>

              <label>
                Формат
                <select value={form.format} onChange={event => update('format', event.target.value)} disabled={!meta}>
                  {(meta?.formats ?? [form.format]).map(format => <option key={format}>{format}</option>)}
                </select>
              </label>

              <label>
                Категория
                <select value={form.category} onChange={event => update('category', event.target.value)} disabled={!meta}>
                  {categoryOptions.length ? categoryOptions.map(category => <option key={category}>{category}</option>) : <option>{form.category}</option>}
                </select>
              </label>

              <label>
                Бюджет, ₸
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.budget}
                  onChange={event => update('budget', event.target.value)}
                  placeholder="1000000"
                />
              </label>

              <label>
                Длительность, ч
                <input
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                  value={form.hours}
                  onChange={event => update('hours', event.target.value)}
                  placeholder="не важно"
                />
              </label>

              <label>
                Язык
                <select value={form.language} onChange={event => update('language', event.target.value)} disabled={!meta}>
                  <option value="">любой</option>
                  {(meta?.languages ?? []).map(language => <option key={language}>{language}</option>)}
                </select>
              </label>

              <button className="primary-button" type="submit" disabled={!canSubmit || loading}>
                {loading ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
                Подобрать
              </button>
            </form>

            <div className="preset-list">
              {presets.map(preset => (
                <button type="button" key={preset.label} onClick={() => applyPreset(preset.query)}>
                  <span>{preset.label}</span>
                  <small>{preset.note}</small>
                </button>
              ))}
            </div>

            <section className="method-panel" aria-label="Как работает подбор">
              <h2>Как считается</h2>
              <ol>
                <li>Берём только город и категорию из каталога.</li>
                <li>Убираем занятых, дорогих и неподходящих по формату.</li>
                <li>Проверяем язык и длительность, если они указаны.</li>
                <li>Сортируем стабильно: смысл описания, цена, ID.</li>
              </ol>
            </section>
          </aside>

          <section className="results-panel">
            <div className="result-header">
              <div>
                <p className="eyebrow">Детерминированная выдача</p>
                <h2>Карточки и объяснения</h2>
              </div>
              {result && (
                <span className="runtime">
                  <Clock3 size={16} />
                  {result.elapsedMs} мс · {modeLabel(result.explanationMode)}
                </span>
              )}
            </div>

            {submitError && <div className="state danger"><AlertCircle size={20} />{submitError}</div>}

            {!result && !submitError && (
              <div className="empty-state">
                <Sparkles size={26} />
                <p>Выберите параметры или один из демо-запросов. Здесь появится до трех карточек с проверяемыми причинами выбора.</p>
              </div>
            )}

            {result && (
              <>
                <div className={`state ${result.status === 'matched' ? 'ok' : 'warn'}`}>
                  {result.status === 'matched' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                  <span>{statusCopy(result)}</span>
                </div>

                <div className="query-summary">
                  <span><MapPin size={15} />{result.query.city}</span>
                  <span><CalendarDays size={15} />{dateText(result.query.date)}</span>
                  <span><WalletCards size={15} />{money(result.query.budget)} ₸</span>
                  {result.query.language && <span><Languages size={15} />{result.query.language}</span>}
                </div>

                {result.status === 'matched' && result.excludedCount > 0 && (
                  <div className="screening-line">
                    <span>Отсеяно {result.excludedCount} из {result.totalInCategory}</span>
                    {activeReasons(result).map(([reason, count]) => (
                      <small key={reason}>{reasonLabel(reason)}: {count}</small>
                    ))}
                  </div>
                )}

                <div className="cards">
                  {result.recommendations.map((card, index) => (
                    <article className="contractor-card" key={card.profile.id}>
                      <div className="rank">{index + 1}</div>
                      <div className="card-main">
                        <div className="card-head">
                          <div>
                            <h3>{card.profile.name}</h3>
                            <p>{card.profile.categories.join(', ')}</p>
                          </div>
                          <span className={card.profile.synthetic ? 'source synthetic' : 'source'}>{card.profile.synthetic ? 'synthetic' : 'catalog'}</span>
                        </div>
                        <p className="explanation">{card.explanation}</p>
                        <div className="badges">
                          {profileBadges(card, result.query).map(badge => <span key={badge}>{badge}</span>)}
                        </div>
                        <details>
                          <summary>
                            <ChevronDown size={16} />
                            Источник и правило ранжирования
                          </summary>
                          <p>{card.rankReason}. ID профиля: {card.profile.id}.</p>
                          <blockquote>{card.evidence.find(item => item.id === card.selectedEvidenceId)?.text ?? card.evidence[0]?.text}</blockquote>
                        </details>
                      </div>
                    </article>
                  ))}
                </div>

                {result.status !== 'matched' && (
                  <div className="diagnostics">
                    <h3>Почему пусто</h3>
                    <div className="reason-grid">
                      {Object.entries(result.reasons).map(([reason, count]) => (
                        <span key={reason}>{reasonLabel(reason)}: {count}</span>
                      ))}
                    </div>
                    {result.suggestions.length > 0 && (
                      <div className="suggestions">
                        {result.suggestions.map(suggestion => (
                          <button
                            key={`${suggestion.label}-${suggestion.eligible}`}
                            type="button"
                            onClick={() => {
                              const next: FormState = {
                                city: suggestion.query.city,
                                date: suggestion.query.date,
                                format: suggestion.query.format,
                                category: suggestion.query.category,
                                budget: String(suggestion.query.budget),
                                hours: suggestion.query.hours === undefined ? '' : String(suggestion.query.hours),
                                language: suggestion.query.language ?? '',
                              };
                              setForm(next);
                              void search(suggestion.query);
                            }}
                          >
                            {suggestion.label}
                            <small>{suggestion.eligible} подойдет</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
