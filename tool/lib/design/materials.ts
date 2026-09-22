/**
 * KOBO — 内容ごとの「材料」を数える
 *
 * **表に○があっても、材料が無ければその表現は選べない**（D-206）。
 * ここはその判定に使う数を、案件データから機械的に数えるだけ。
 * **値は作らない。数えるだけ。**
 */

import type { Project } from "../schema.ts";
import type { ContentId, Materials } from "./system/index.ts";
/** **画面と同じ規則で文を区切る。** 別々に持つと必ずずれる（D-197・D-433） */
import { splitParts } from "./text.ts";

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
    /**
     * 取り扱い（汎用プラン・D-272）。**名前・内容・料金の3つを数える。**
     *
     * 料金が入っているかで、選べる表現が変わる。
     * 料金が揃っていれば `spec`（突き合わせて読む表）が効き、
     * 揃っていなければカードか読み物にする。**無い料金を表に組まない。**
     */
    case "offerings": {
      const os = arr(p.general?.offerings);
      const priced = os.filter((o: any) => text(o?.price));
      const detail = os.map((o: any) => text(o?.detail)).join("");
      return {
        ...base,
        count: os.length,
        // 表は**全件**を並べるので、行数は別に数える（設備の一覧と同じ扱い）
        rows: os.length,
        length: detail.length,
        // 「30,000円〜」のように短く言い切れる料金が、**2件以上そろっているか**
        hasShortValue: priced.filter((o: any) => isShortValue(text(o.price))).length >= 2,
        hasStrongValue: priced.filter((o: any) => isShortValue(text(o.price)) && /\d/.test(text(o.price))).length >= 2,
      };
    }
    case "conditions": {
      const vals = [text(cap.tolerance), text(cap.shortestLeadTime), text(cap.lotSize), (cap.materials ?? []).join("・"), (cap.certifications ?? []).join("・")].filter(Boolean);
      /**
       * **判定する値と、実際に描く値を揃える**（D-251）。
       *
       * ここが揃っていなかったために、
       * 資格の「ISO9001」で「数字のある条件がある」と判定し、
       * **画面には「案件により相談」が大きく出る**、ということが起きた（実測）。
       * 大きく出す候補は**公差・納期・ロットの3つ**で、資格も材質も数字ではない。
       */
      const numeric = [text(cap.tolerance), text(cap.shortestLeadTime), text(cap.lotSize)].filter(Boolean);
      return {
        ...base,
        count: vals.length,
        length: vals.join("").length,
        hasShortValue: vals.some(isShortValue),
        // **数字を含んで初めて条件になる**（D-251）。`analyze` の heroFigure と同じ規則
        hasStrongValue: numeric.some((v) => isShortValue(v) && /\d/.test(v)),
        /**
         * 対比は「標準◯／最短◯」のように**2つの値が1つの文に入っている**ときに成り立つ。
         * **描くのは納期だけ**（`Present.astro` の `Comparison`）なので、納期だけを見る。
         * ロットの「1個から…まで」で立てると、**納期の欄に対比でない文が入る。**
         */
        hasPair: /標準.*最短|最短.*標準|通常.*急ぎ|急ぎ.*通常/.test(text(cap.shortestLeadTime)),
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
      /**
       * カードは**型番の分かっているもの**から作るので、その数を数える（`count`）。
       * 一覧表は**全台**を並べるので、行数は別に数える（`rows`）。
       * 台数の合計は「大きな数字」として出せる（13台、のように）。
       */
      return { ...base, count: named.length, rows: eq.length, length: eq.length, hasShortValue: total > 0 };
    }
    case "cases": {
      const cs = arr(p.cases);
      const joined = cs.map((c: any) => [c?.challenge, c?.solution, c?.result].filter(Boolean).join("")).join("");
      /**
       * **工程として描かれるのは1件の中だけ**（D-237）。
       * その1件が何段になるかを数える（課題・対応・結果で最大3段）。
       */
      /**
       * **段数は、いちばん多く埋まっている1件で数える**（D-302）。
       *
       * 直す前は「3つとも揃っている事例が1件でもあるか」だけを見ていた。
       * ところが事例の個別ページ（1件だけを渡す）では、
       * 結果が取材で埋まっていない案件が**工程として見せられない**と判定され、
       * 「ご相談から結果まで」の帯が**引用に化けて、対応した内容が丸ごと落ちた**（実測）。
       * 2段あれば順序は成り立つ（D-251の条件と同じ）。
       */
      const stepsOf = (c: any) => [c?.challenge, c?.solution, c?.result].filter((x: any) => text(x)).length;
      const steps = cs.length ? Math.max(...cs.map(stepsOf)) : 0;
      /**
       * **表にしたときの行数。**
       *
       * 一覧（トップ・事例一覧）は**1件1行**なので、行数＝件数。
       * 事例の個別ページだけは、その1件の**材質・数量・納期・加工法・お断りの理由**が行になる。
       *
       * **「件数が1なら個別ページ」と見なしてはいけない**（実測で踏んだ）。
       * 事例が1件しかない会社のトップページで、1件の表が「5行ある」と数えられ、
       * **工程の帯が表に化けた。** どちらの画面かは、渡す側が言う（`caseDetail`）。
       */
      const one = cs[0];
      const rows = (p as any).caseDetail === true && one
        ? [one.partDescription, one.materials?.length ? "y" : "", one.quantity, one.leadTime,
           one.processes?.length ? "y" : "", one.declinedReason]
            .filter((x: any) => text(x)).length
        : cs.length;
      return {
        ...base, count: cs.length, rows, length: joined.length,
        hasQuote: hasQuoted(joined),
        hasSteps: steps >= 2,
        steps,
      };
    }
    case "technique": {
      const v = text(st.followUpFindings);
      /** 【見出し】で区切られた数が、そのまま工程の段数になる（`splitParts` と同じ数え方） */
      const parts = (v.match(/【[^】]+】/g) ?? []).length || (v ? 1 : 0);
      return { ...base, count: parts, steps: parts, length: v.length, leadLength: splitParts(v)[0]?.body.length ?? 0,
               hasSteps: hasSteps(v), hasQuote: hasQuoted(v) };
    }
    case "declined": {
      const v = [text(st.wonAfterOthersDeclined), text(st.workOthersAvoid), text(st.hardestJob)].filter(Boolean);
      return { ...base, count: v.length, length: v.join("").length, leadLength: (v[0] ?? "").length, hasQuote: hasQuoted(...v) };
    }
    case "praise": {
      const v = [text(st.praiseFromClients), text(st.workOthersAvoid), text(st.hardestJob)].filter(Boolean);
      return { ...base, count: v.length, length: v.join("").length, leadLength: (v[0] ?? "").length, hasQuote: hasQuoted(...v) };
    }
    case "history": {
      const h = arr(basics.history);
      return { ...base, count: h.length, length: h.map((x: any) => text(x?.event)).join("").length };
    }
    case "executive": {
      const v = [text(p.executive?.vision), text(p.executive?.messageToStaff)].filter(Boolean);
      return { ...base, count: v.length, length: v.join("").length, leadLength: (v[0] ?? "").length, hasQuote: hasQuoted(...v) };
    }
    case "photos": {
      const ph = arr(p.photos).filter((x: any) => x?.file && !/\.svg$/i.test(String(x.file)));
      return { ...base, count: ph.length, hasRealPhotos: ph.length > 0 };
    }
    /**
     * 会社概要。**発注前に確かめる欄の、埋まっている数**（D-301）。
     * 空欄は行ごと出さないので（D-095）、埋まっている行だけを数える。
     */
    case "profile": {
      const vals = [
        text(basics.name), text(basics.representative), text(basics.founded), text(basics.capital),
        basics.employees ? String(basics.employees) : "", text(basics.address),
        text(basics.tel), text(p.terms?.inquiryNotifyEmail), text(basics.businessSummary),
        arr(basics.clientIndustries).join("・"),
      ].filter(Boolean);
      return { ...base, count: vals.length, rows: vals.length, length: text(basics.businessSummary).length };
    }
    /**
     * 採用。**募集要項の行数**で表になるかを決める。
     * 職種と職場の話は件数（`count`）。条件が3行に満たない求人は表にしない（D-171）。
     */
    case "recruit": {
      const r = p.recruitment ?? {};
      const t = r.terms ?? {};
      const terms = [t.employmentType, t.salary, t.workingHours, t.holidays,
        arr(t.allowances).join("、"), t.insurance, t.qualifications, t.selection,
        t.documents, t.contact, t.factoryTour].map(text).filter(Boolean);
      const blocks = [arr(r.neededRoles).join("、"), arr(r.workplaceAppeal).join("、")].map(text).filter(Boolean);
      return { ...base, count: blocks.length, rows: terms.length, length: blocks.join("").length, leadLength: (blocks[0] ?? "").length };
    }
    /**
     * お問い合わせ。用紙は必ずあるので `length` は固定。
     * 数えるのは**ご連絡先の埋まっている数**で、電話しか無い会社では一覧にしない。
     */
    case "inquiry": {
      const contacts = [text(basics.tel), text(p.terms?.inquiryNotifyEmail),
        text(basics.address), text(cap.operatingHours)].filter(Boolean);
      return { ...base, count: contacts.length, rows: contacts.length, length: 1 };
    }
    case "draft":
      return { ...base, count: 1, length: 300 };
  }
}
