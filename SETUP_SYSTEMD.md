# systemd環境でのセットアップガイド

このガイドは、DebianまたはUbuntu上でsystemdを使い、Misskey Mercuryをホストに直接常駐させる手順を示します。
Dockerで動かす場合は[SETUP_DOCKER.md](SETUP_DOCKER.md)を、既存環境の更新手順は[UPDATE_MERCURY.md](UPDATE_MERCURY.md)を参照してください。

## 前提となるソフトウェア

Misskey Mercuryは、上流のMisskeyと同じ実行環境を必要とします。
次のソフトウェアをあらかじめ用意してください。

- **Node.js**：このリポジトリは`.node-version`で26.4.0を指定しています。同じメジャーバージョン系列（26.x）を用意してください。
- **pnpm**：バージョンは`package.json`の`packageManager`フィールドで固定されています。インストール手順は次節で示します。
- **PostgreSQL**：15以降。このリポジトリのDocker構成は18を使用しています。
- **Redis**：7以降。
- **ffmpeg**とビルドツール一式（`build-essential`など）。メディア処理とネイティブ依存のビルドに必要です。

画像処理に使うsharpライブラリの要件により、SSE4.2命令セットに対応していないx86_64 CPUでは動作しません。
仮想マシンや古いハードウェアにインストールする場合は、事前にCPUの対応状況を確認してください。
ARM64などx86_64以外の環境では、この制約の対象外です。

## Node.jsとpnpmのインストール

DebianやUbuntuの標準リポジトリが提供するNode.jsは、多くの場合古すぎます。
NodeSourceの配布スクリプトで26系を導入してください。

```bash
curl -fsSL https://deb.nodesource.com/setup_26.x | sudo -E bash -
sudo apt-get install -y nodejs
```

pnpmは、`package.json`が指定するバージョンをグローバルに導入します。
バージョン文字列を手で書き写す代わりに、リポジトリ取得後に`package.json`から読み取って渡すと、取り違えを防げます（この方法はDockerfileと同じです）。
具体的な手順は、次節でリポジトリを取得したあとに示します。

## 実行用ユーザーとソースコードの取得

Misskey Mercuryを実行する専用のシステムユーザーを作成します。
一般ユーザーの権限で不要なファイルへのアクセスを許してしまわないための区分けです。

```bash
sudo useradd --system --no-create-home --home-dir /opt/misskey-mercury --shell /usr/sbin/nologin misskey
sudo mkdir -p /opt/misskey-mercury
sudo chown misskey:misskey /opt/misskey-mercury
sudo -u misskey git clone --branch develop https://github.com/harunoya/misskey-mercury.git /opt/misskey-mercury
cd /opt/misskey-mercury
```

`useradd`に`--create-home`を付けないのは、`/etc/skel`のドットファイルがあらかじめ配置された状態になり、直後の`git clone`が「ディレクトリが空でない」というエラーで失敗するためです。
ディレクトリ自体は`mkdir`で作り、所有者だけを`misskey`に変更しています。

特定のリリースを使う場合は、`develop`ブランチではなくタグをチェックアウトしてください。
利用可能なタグは、[Releases](https://github.com/harunoya/misskey-mercury/releases)で確認できます。

```bash
sudo -u misskey git -C /opt/misskey-mercury checkout mercury-v0.3.1
```

リポジトリを取得したら、pnpmをインストールします。

```bash
sudo npm install -g "$(node -e "console.log(JSON.parse(require('node:fs').readFileSync('/opt/misskey-mercury/package.json')).packageManager)")"
```

## 依存パッケージのインストールとビルド

以降のコマンドは、`misskey`ユーザーで、リポジトリのルートディレクトリから実行します。
`misskey`のログインシェルは`nologin`なので、`bash`を明示して起動します。

```bash
sudo -H -u misskey bash
cd /opt/misskey-mercury
pnpm install --frozen-lockfile
pnpm build
```

ビルドは、フロントエンドとバックエンドの両方をコンパイルします。
初回は数分かかることがあります。

## PostgreSQLとRedisの準備

PostgreSQLとRedisをホストに導入し、Misskey Mercury専用のデータベースとロールを作成します。
導入方法はディストリビューションのパッケージマネージャに従ってください。

```bash
sudo -u postgres createuser --pwprompt misskey
sudo -u postgres createdb --owner=misskey misskey
```

Redisは、追加の設定なしにデフォルトの`localhost:6379`で動作していれば十分です。
複数のアプリケーションで一つのRedisを共有する場合は、`.config/default.yml`の`redis.db`でデータベース番号を分けてください。

## 設定ファイルの作成

`.config/example.yml`をコピーし、環境に合わせて編集します。

```bash
cp .config/example.yml .config/default.yml
```

編集が必要な主な項目は次のとおりです。

- **url**：外部からアクセスするURL。後段のリバースプロキシで終端するHTTPSのURLを指定します。
- **port**：Misskeyプロセスが待ち受けるポート。デフォルトは3000です。
- **db**：`host`、`port`、`db`、`user`、`pass`を、前節で作成したPostgreSQLのロールに合わせます。
- **redis**：`host`、`port`を、実際に動作しているRedisに合わせます。
- **setupPassword**：初回セットアップ時に管理者アカウントを作成するためのパスワード。設定すると、セットアップ完了後は使われなくなります。

## データベースの初期化

設定ファイルを保存したら、マイグレーションを実行してデータベースのスキーマを作成します。

```bash
pnpm run migrate
```

このコマンドは、`.config/default.yml`をJSONへ変換したうえで、保留中のマイグレーションを順に適用します。
初回セットアップでは、すべてのマイグレーションが新規に適用されます。

## systemdユニットの作成

`misskey`ユーザーのシェルを抜け、root権限でユニットファイルを作成します。

```bash
sudo tee /etc/systemd/system/misskey-mercury.service > /dev/null <<'EOF'
[Unit]
Description=Misskey Mercury
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=misskey
WorkingDirectory=/opt/misskey-mercury
Environment="NODE_ENV=production"
ExecStart=/usr/bin/pnpm run start
Restart=on-failure
RestartSec=5
SyslogIdentifier=misskey-mercury

[Install]
WantedBy=multi-user.target
EOF
```

`ExecStart`の`pnpm`のパスは、環境によって異なります。
`misskey`ユーザーで`command -v pnpm`を実行し、その出力に置き換えてください。

`start`スクリプトは、リポジトリのルートの`package.json`に定義されています。
内部で`packages/backend`へ移動してから、設定ファイルの変換とプロセスの起動を行います。

## サービスの起動と自動起動の設定

ユニットファイルを読み込み、サービスを起動します。

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now misskey-mercury
sudo systemctl status misskey-mercury
```

ログはjournaldに記録されます。

```bash
journalctl -u misskey-mercury -f
```

## リバースプロキシの設定

Misskeyは、HTTPS終端とWebSocketのアップグレードを行うリバースプロキシの配下での運用を前提とします。
nginxを使う場合の設定例は次のとおりです。

```nginx
server {
    listen 443 ssl http2;
    server_name example.tld;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        client_max_body_size 0;
    }
}
```

`client_max_body_size`は、アップロードを許可するファイルサイズの上限に合わせて設定してください。
`0`を指定すると上限を課しません。

TLS証明書の取得と更新は、Let's Encryptとcertbotなど、任意の方法で構いません。

## 初回セットアップ

ブラウザで`url`に設定したアドレスへアクセスし、案内に従って管理者アカウントを作成します。
`.config/default.yml`に`setupPassword`を設定していた場合は、その値を入力します。

管理者アカウントの作成が完了すれば、セットアップは終わりです。

## CherryPickから移行する場合

CherryPickのデータベースを引き継ぐ場合は、マイグレーションを実行する前に、フォーク向けの事前チェックスクリプトを実行してください。

```bash
pnpm --filter backend check-yojoart-cherrypick-migration
```

このスクリプトは読み取り専用で、対象のスキーマに対して実際のマイグレーションが失敗しないかを確認します。
チェックで問題が報告された場合は、`pnpm run migrate`を実行する前に原因を解消してください。
