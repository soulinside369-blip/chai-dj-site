import site from '../data/site.json';
import formatsData from '../data/formats.json';
import calc from '../data/calc.json';
import faq from '../data/faq.json';
import casesData from '../data/cases.json';
import equipment from '../data/equipment.json';
import occasionsData from '../data/occasions.json';
import scenariosData from '../data/scenarios.json';

export { site, calc, faq, equipment };
export const formats = formatsData.items;
export const occasions = occasionsData.items;
export const scenarios = scenariosData;
/** Превью на github.io (сайт не в корне) — закрываем от индексации, чтобы не было дублей боевого домена */
export const isPreview = import.meta.env.BASE_URL !== '/';
export const cases = casesData.cases;
export const reviews = casesData.reviews;
/** На сайт попадает только реальный кейс: не черновик и не пример (в поле «Клиент» нет слова ПРИМЕР) */
export const isRealCase = (c: { draft?: boolean; client?: string }) => !c.draft && !/ПРИМЕР/i.test(c.client || '');
export const logos = casesData.logos as { name: string; image: string }[];

export const B = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
export const url = (p = '') => B + p.replace(/^\//, '');

export const isStub = (s?: string) => !s || /^\[.*\]$/.test(s.trim());

export const fmtByKey = (k: string) => formats.find((f) => f.key === k)!;

/** Ссылки мессенджеров: пусто в данных — ведём на страницу контактов */
export const links = {
  telegram: site.contacts.telegram ? `https://t.me/${site.contacts.telegram.replace(/^@/, '')}` : url('kontakty/'),
  max: site.contacts.max ? (site.contacts.max.startsWith('http') ? site.contacts.max : `https://max.ru/${site.contacts.max.replace(/^@/, '')}`) : url('kontakty/'),
  whatsapp: site.contacts.whatsapp ? `https://wa.me/${site.contacts.whatsapp.replace(/\D/g, '')}` : '',
  phone: site.contacts.phone ? `tel:${site.contacts.phone.replace(/[^\d+]/g, '')}` : '',
};

export const nav = [
  { href: 'uslugi/', label: 'Услуги' },
  { href: 'keysy/', label: 'Кейсы' },
  { href: 'oborudovanie/', label: 'Оборудование' },
  { href: 'o-nas/', label: 'О нас' },
  { href: 'faq/', label: 'Вопросы' },
  { href: 'kontakty/', label: 'Контакты' },
];
