/**
 * KOBO — 内容ごとの「材料」を数える
 *
 * **表に○があっても、材料が無ければその表現は選べない**（D-206）。
 * ここはその判定に使う数を、案件データから機械的に数えるだけ。
 * **値は作らない。数えるだけ。**
 */

import type { Project } from "../schema.ts";
import type { ContentId, Materials } from "./system/index.ts";

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** 短く言い切れる値か。**長い文を「大きな数字」として出さない**（D-203） */
export const isShortValue = (v: string): boolean =>
  v.length > 0 && v.length <= 14 && !/[。、]/.test(v);

/** 鍵括弧つきの発言があるか。**引用は、言った言葉があるときだけ** */
const hasQuoted = (...vs: string[]): boolean => vs.some((v) => /[「『][^」』]{4,}[」』]/.test(v));

/** 順序のある記述か。取材メモの【見出し】や、工程を示す言葉で判断する */
const hasSteps = (...vs: string[]): boolean =>
  vs.some((v) => (v.match(/【[^】]+】/g) ?? []).length >= 2 || /(→|ののち|してから|そのあと|順序|段取り)/.test(v));

export function materialsOf(project: Project, content: ContentId, hasRealPhotos: boolean): Materials {
  const p = project as any;
  const cap = p.capability ?? {};
  const st = p.strengths ?? {};
  const basics = p.basics ?? {};
  const base: Materials = {
    count: 0, length: 0, hasShortValue: false, hasPair: false,
    hasQuote: false, hasSteps: false, hasRealPhotos,
  };

  switch (content) {
    case "conditions": {
      const vals = [text(cap.tolerance), text(cap.shortestLeadTime), text(cap.lotSize), (cap.materials ?? []).join("・"), (cap.certifications ?? []).join("・")].filter(Boolean);
      return {
        ...base,
        count: vals.length,
        length: vals.join("").length,
        hasShortValue: vals.some(isShortValue),
        // 対比は「標準◯／最短◯」のように**2つの値が1つの文に入っている**ときに成り立つ
        hasPair: /標準.*最短|最短.*標準|通常.*急ぎ|急ぎ.*通常/.test(text(cap.shortestLeadTime))
          || /から.*まで/.test(text(cap.lotSize)),
      };
    }
    case "materials": {
      const n = arr(cap.materials).length + arr(cap.processes).length;
      return { ...base, count: n, length: arr(cap.materials).join("").length };
    }
    case "equipment": {
      const eq = arr(cap.equipment);
      const named = eq.filter((e: any) => text(e?.maker) && text(e?.model));
      const total = eq.reduce((s: number, e: any) => s + (Number(e?.count) || 0), 0);
      // カードは**型番の分かっているもの**から作るので、その数を数える。
      // 台数の合計は「大きな数字」として出せる（13台、のように）
      return { ...base, count: named.length, length: eq.length, hasShortValue: total > 0 };
    }
    case "cases": {
      const cs = arr(p.cases);
      const joined = cs.map((c: any) => [c?.challenge, c?.solution, c?.result].filter(Boolean).join("")).join("");
      return {
        ...base, count: cs.length, length: joined.length,
        hasQuote: hasQuoted(joined),
        // 課題→解決→結果が揃っている事例が1件でもあれば、工程として見せられる
        hasSteps: cs.some((c: any) => text(c?.challenge) && text(c?.solution) && text(c?.result)),
      };
    }
    case "technique": {
      const v = text(st.followUpFindings);
      return { ...base, count: (v.match(/【[^】]+】/g) ?? []).length || (v ? 1 : 0), length: v.length, hasSteps: hasSteps(v), hasQuote: hasQuoted(v) };
    }
    case "declined": {
      const v = [text(st.wonAfterOthersDeclined), text(st.workOthersAvoid), text(st.hardestJob)].filter(Boolean);
      return { ...base, count: v.length, length: v.join("").length, hasQuote: hasQuoted(...v) };
    }
    case "praise": {
      const v = [text(st.praiseFromClients), text(st.workOthersAvoid), text(st.hardestJob)].filter(Boolean);
      return { ...base, count: v.length, length: v.join("").length, hasQuote: hasQuoted(...v) };
    }
    case "history": {
      const h = arr(basics.history);
      return { ...base, count: h.length, length: h.map((x: any) => text(x?.event)).join("").length };
    }
    case "executive": {
      const v = [text(p.executive?.vision), text(p.executive?.messageToStaff)].filter(Boolean);
      return { ...base, count: v.length, length: v.join("").length, hasQuote: hasQuoted(...v) };
    }
    case "photos": {
      const ph = arr(p.photos).filter((x: any) => x?.file && !/\.svg$/i.test(String(x.file)));
      return { ...base, count: ph.length, hasRealPhotos: ph.length > 0 };
    }
    case "draft":
      return { ...base, count: 1, length: 300 };
  }
}
