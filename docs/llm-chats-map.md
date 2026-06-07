# LLMチャット 該当箇所＆対応チェック表

Flow Inspector 内で **LLM（claude CLI サブプロセス）を呼ぶ全箇所**の一覧。
「どのチャットが・どこのコード（フロント/バック）で・どのプロンプト/モデル/データを使うか」を一望し、
プロンプト調整時の影響範囲チェックに使う。

> 行番号は目安（編集でズレる）。**関数名・定数名で探すのが確実**。
> 最終更新: 2026-06-04（このセッションの改修反映後）

## 共通の仕組み

- 呼び出し: `claude -p <full_prompt> --output-format text --tools ""`（サブプロセス、引数リスト渡し＝injection安全）
- ストリーミング: `_claude_sse_generator()`（SSE）。生成系（ケース/評価器/judge）だけ非ストリームの一発実行。
- **`NO_TOOLS_PREFIX`**（`server/main.py:1366`）を `full_prompt` 先頭に注入 → `~/.claude` の superpowers 等が
  サブプロセスにも効いて「スキルを確認します」＋`<function_calls>`記法を吐くノイズを抑制。
  注入箇所: `/api/chat`・`/api/chat/design-node`・`/api/flows/{id}/eval/chat` の3経路。
- モデル: 明示 `--model sonnet` は **CLAUDE.md / ダッシュボード / SKILL本文生成** のみ。他は **CLIデフォルト**（ユーザー設定依存・Opus固定ではない）。

## 一覧表

| # | チャット（UI名） | フロント | バック endpoint | system prompt（定数:行） | モデル | 渡すデータ | 出力/挙動 |
|---|---|---|---|---|---|---|---|
| 1 | ダッシュボードアシスタント | `DashChat` (static:11030) | `/api/chat` `dashboard` | `DASHBOARD_SYSTEM` (main:1384) | **sonnet** | `build_dashboard_context()` (1429) ＝設定スナップショット | 設定の質問に回答（推測でっち上げ禁止） |
| 2 | フロー構築アシスタント | `FlowBuildChat` (static:11659, send:11777) | `/api/chat` `flow-build` | `FLOW_BUILD_SYSTEM` (1639) | CLIデフォルト | `build_board_context()` (1555) ＋ `build_required_section()` (1607) | ```flow_actions``` で操作提案→適用ボタン。**未入力必須を会話で確認** |
| 3 | フローレビュー（保存前） | `SkillSaveFlow` (static:12271) | `/api/chat` `flow-review` | `FLOW_REVIEW_SYSTEM` (1741) | CLIデフォルト | `build_board_context()` ＋ `det_findings`（機械チェック済） | ```review``` で意味的指摘 |
| 4 | スキル相談（保存後） | `SkillDiscussChat` (static:11905) | `/api/chat` `skill-discuss` | `SKILL_DISCUSS_SYSTEM` (1805) | CLIデフォルト | `build_skill_context()` (1774) ＝SKILL.md全文 | 使い方/調整の相談 |
| 5 | ノード/フロー説明チャット | `ChatPanel` (static:8988) | `/api/chat` `node-settings` | `NODE_EXPLAIN_SYSTEM` (1508) | CLIデフォルト | `build_flow_context()` (1330) ＋ `build_source_line()` (1590) | **読み取り専用の説明**。修正要望(intent=fix)は ```edit_prompt``` をコピペ生成 |
| 6 | CLAUDE.md作成/編集チャット | `ClaudeMdChat` (static:11979) | `/api/chat` `claude-md` | `CLAUDE_MD_SYSTEM` (1815) ＋レイヤーガイド＋`CLAUDE_MD_PROPOSE_FIRST` (1894) | **sonnet** | `build_claude_md_request()` (1907) ＝レイヤー別コード要約/既存本文 | **入口ボタンで意図選択**(修正/追記/新規)→提案ファースト。```markdown```(4連)で本文出力 |
| 7 | AI Design（ノード設計） | `AIDesignChat` (static:9275) | `/api/chat/design-node` (2145) | `DESIGN_NODE_SYSTEM` (2107) | CLIデフォルト | `build_flow_context()` ＋挿入位置 | ```node_spec``` でノード設計。**※レガシー：現UI(plan-workspace)から未到達の疑い** |
| 8 | Evalチャット | `EvalPage` (static:15538) | `/api/flows/{id}/eval/chat` (2715) | `EVAL_CHAT_SYSTEM` (2708) | CLIデフォルト | `build_flow_context()` ＋eval結果(run/case pass/fail) | 評価結果の分析。**会話セッション永続化あり** |
| 9 | 汎用フォールバック | `ChatPanel`（ノード未選択かつ非該当時のみ） | `/api/chat` default | `CHAT_SYSTEM_PREFIX` (1372) | CLIデフォルト | `build_flow_context()` | 汎用相談（実質ほぼ未経路） |
| 10 | Evalケース自動生成 | `EvalPage` | `/api/flows/{id}/eval/cases/generate` (2403) | インラインprompt | CLIデフォルト | `build_flow_context()` | JSON配列→ケース保存（非stream・120s） |
| 11 | Eval評価器自動生成 | `EvalPage` | `/api/flows/{id}/eval/evaluators/generate` (2470) | インラインprompt ＋ `body.focus` | CLIデフォルト | `build_flow_context()` | JSON配列→評価器保存（非stream） |
| 12 | Eval実行 judge | `EvalPage` | `/api/flows/{id}/eval/run` (2598) | `judge_prompt`（インライン） | CLIデフォルト | flow_desc＋case＋evaluator.prompt | pass/fail判定JSON（非stream） |
| 13 | SKILL.md本文生成 | `SkillSaveFlow` (static:12369) | `/api/skills/generate-body` (1020) | `flow_codec` 内ノード別 | **sonnet** | flow JSON＋ノード隣接 | SKILL.md本文を並列生成（SSE進捗） |

## このセッションで変えたところ（対応チェック）

- [x] **#1 ダッシュボード**: キーワード検索 → LLM(sonnet)化（`DASHBOARD_SYSTEM`/`build_dashboard_context` 新設）
- [x] **#2 フロー構築**: 「未入力必須項目を会話で確認」追加（`build_required_section`＋`ChatRequest.required_status`＋フロント `missingRequiredForBoard`）
- [x] **#5 ノード説明**: 「設定を埋める」→「**現状把握の説明**」に作り替え（`NODE_SETTINGS_SYSTEM`→`NODE_EXPLAIN_SYSTEM`）。修正要望は ```edit_prompt``` をコピペ生成（`build_source_line` で skill名+パス注入）。
  - CLAUDE.md追加機能は一度入れたが**撤去**（コミット `8cf0e97`）。ノード説明は「説明＋スキル修正」専念。
- [x] **#6 CLAUDE.md**: ①内部ラベル(A相当/B)漏れ除去 ②project系=フォルダ深読み提案ファースト(`CLAUDE_MD_PROPOSE_FIRST`) ③USER GLOBAL=候補メニュー対案 ④**入口ボタンで意図選択**(修正/追記/新規)・追記は「何を足す?」と先に聞くだけ(`startWithIntent`/`intentRef`/`build_claude_md_request` intent分岐)
- [x] **共通ノイズ抑制**: `NO_TOOLS_PREFIX` を /api/chat・design-node・eval-chat に注入

## 「同じ場所から来てる？」チェック（影響範囲）

プロンプト/挙動を1つ直すとき、**どこが連動するか**：

- **`/api/chat` は context_type で分岐**（`server/main.py:2028`〜）。`flow-build / flow-review / skill-discuss / claude-md / dashboard / node-settings / default` が**同じハンドラ内の分岐**。
  → ある context のプロンプトだけ直すなら、その分岐の `system_prompt`/`context` だけ触れば他に波及しない。
  → 逆に **`NO_TOOLS_PREFIX` や `build_flow_context` は複数 context が共有**。ここを直すと該当全部に効く。
- **フロントのチャットUIは各コンポーネントが独立**。特に紛らわしい2つ：
  - `ChatPanel`(#5, 説明) の意図ボタンは `startIntent`。
  - `ClaudeMdChat`(#6, CLAUDE.md) の意図ボタンは `startWithIntent`。
  - → **別関数・別コンポーネント。片方を直してももう片方は無影響**（2026-06-04 確認済）。
- 共有ユーティリティ（連動するので注意）: `build_flow_context`(#5,7,8,9,10,11) / `build_board_context`(#2,3) / `NO_TOOLS_PREFIX`(全SSE系) / `_claude_sse_generator`(全SSE系)。

## 既知の論点（未対応・任意）

- **nodeType 一覧の不一致**: `FLOW_BUILD_SYSTEM`(9種) / `NODE_EXPLAIN`系 / `DESIGN_NODE_SYSTEM`(7種, skill/think欠落) でバラバラ。共通定数化すると揃う。
- **#7 AI Design はレガシーの疑い**（plan-workspace 移行で現UI未到達）。撤去候補。
- **#10-12 Eval生成系のプロンプトが薄い**（インライン2〜4行）。強化余地。モデルも用途別に固定推奨（軽い生成は sonnet）。
- `CLAUDE_MD_SYSTEM` の「## 進め方」番号が **6が重複**（連番ミス・実害軽微）。
