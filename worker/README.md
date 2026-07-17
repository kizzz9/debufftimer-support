# DebuffTimer お問い合わせ Worker

GitHub Pages のサポートページのフォーム送信を受け、Resend で開発者へメール転送する Cloudflare Worker。
Canopy の `canopy-contact` / Tabilm の `tabilm-contact` と同一構成の DebuffTimer 版。

- サイト本体は GitHub Pages のまま（この Worker は送信の受け口だけ）
- 宛先メールアドレスは Worker のシークレット（`CONTACT_TO`）に入れるだけで、ページにもコードにも出ない
- スパム対策: ハニーポット + Origin チェック + Turnstile

## 構成

```
ブラウザ (kizzz9.github.io/debufftimer-support) ─POST─▶ Worker ─▶ Turnstile 検証
                                                           └─▶ Resend API ─▶ 開発者の Gmail
```

## デプロイ手順（初回）

Canopy / Tabilm の Worker と同じ Cloudflare アカウント（ID: `93a6265a7aa9a36837fa7c06a43ea51c`）に、
`debufftimer-contact` として新規デプロイする。

```bash
cd worker
export CLOUDFLARE_API_TOKEN="$(cat .cf_token)"          # Canopy / Tabilm と同じトークンでよい
export CLOUDFLARE_ACCOUNT_ID="93a6265a7aa9a36837fa7c06a43ea51c"

wrangler deploy                    # https://debufftimer-contact.nsmtkz9.workers.dev として公開

# シークレット登録（3つ）
wrangler secret put RESEND_API_KEY    # Canopy / Tabilm と同じ Resend キーを使い回してよい
wrangler secret put CONTACT_TO        # 届け先 Gmail（Resend 登録アドレスと同一にすること）
wrangler secret put TURNSTILE_SECRET  # 下記「Turnstile」参照
```

`.cf_token` は Canopy / Tabilm 側の `worker/.cf_token` と同じ API トークンを流用できる（gitignore 済み）。

## Turnstile

サポートページ（`index.html` / `en/index.html`）の Turnstile ウィジェットは、Canopy / Tabilm と
**同一ドメイン `kizzz9.github.io`** 向けの Site Key `0x4AAAAAADv-5iOVlinTmIvp` をそのまま使っている
（Turnstile は sitekey↔secret がペア）。

- **最短**: `TURNSTILE_SECRET` に既存ウィジェットと同じ Secret Key を登録すれば、そのまま動く
- **分けたい場合**: Cloudflare ダッシュボード → Turnstile で DebuffTimer 用ウィジェットを新規作成し、
  `index.html` / `en/index.html` の `data-sitekey` を新しい Site Key に差し替え、
  `wrangler secret put TURNSTILE_SECRET` で対応する Secret を登録 → push
- **無効化したい場合**: 両 HTML から Turnstile の `<script>` タグと `.cf-turnstile` の div を外す。
  Worker 側は `TURNSTILE_SECRET` 未設定なら検証をスキップするので、ハニーポット + Origin チェックのみで運用できる

## 運用コマンド

```bash
cd worker
export CLOUDFLARE_API_TOKEN="$(cat .cf_token)"
export CLOUDFLARE_ACCOUNT_ID="93a6265a7aa9a36837fa7c06a43ea51c"

wrangler deploy            # 再デプロイ
wrangler secret list       # シークレット確認
wrangler tail              # ライブログ
```

## メール到達性の改善（任意・将来）

独自ドメインを取得して Resend で verify すると、送信元を `support@…` にでき、迷惑メール判定されにくくなる。
現状は `onboarding@resend.dev`（Resend 共有ドメイン）で、宛先は Resend 登録アドレス（= `CONTACT_TO`）のみ。
