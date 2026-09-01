# Dockerでのセットアップガイド

このガイドは、Docker ComposeでMisskey Mercuryを動かす手順を示します。
Dockerを使わずホストへ直接インストールする場合は[SETUP_SYSTEMD.md](SETUP_SYSTEMD.md)を、既存環境の更新手順は[UPDATE_MERCURY.md](UPDATE_MERCURY.md)を参照してください。

## 前提となるソフトウェア

- **Docker**
- **Docker Compose**（`docker compose`サブコマンドが使えるバージョン）

PostgreSQLやRedis、Node.jsをホストに個別インストールする必要はありません。
これらはすべてコンテナ内で完結します。

## ソースコードの取得

```bash
git clone --branch develop https://github.com/harunoya/misskey-mercury.git
cd misskey-mercury
```

特定のリリースを使う場合は、`develop`ブランチではなくタグをチェックアウトしてください。
利用可能なタグは、[Releases](https://github.com/harunoya/misskey-mercury/releases)で確認できます。

```bash
git checkout mercury-v0.3.1
```

## 設定ファイルの作成

Docker向けの設定は、リポジトリに含まれる3つのサンプルファイルから作成します。

```bash
cp compose_example.yml compose.yml
cp .config/docker_example.env .config/docker.env
cp .config/docker_example.yml .config/default.yml
```

`.config/docker.env`には、PostgreSQLの認証情報を設定します。

```env
POSTGRES_PASSWORD=（強固なパスワードに変更）
POSTGRES_USER=（任意のユーザー名に変更）
POSTGRES_DB=misskey
DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}"
```

`.config/default.yml`には、外部からアクセスするURLと、`docker.env`に設定したPostgreSQLの認証情報を反映します。

- **url**：外部からアクセスするURL。後段のリバースプロキシで終端するHTTPSのURLを指定します。
- **db.user**、**db.pass**：`docker.env`の`POSTGRES_USER`、`POSTGRES_PASSWORD`と同じ値にします。
- **setupPassword**：初回セットアップ時に管理者アカウントを作成するためのパスワード。設定すると、セットアップ完了後は使われなくなります。

`db.host`は`db`、`redis.host`は`redis`のままにしてください。
`compose.yml`が定義するサービス名と一致させる必要があります。

`compose.yml`自体は、`web`サービスの`ports`を編集して、ホストに公開するポートを決めます。
既定では、ホストの3000番をコンテナの3000番に対応させています。

## イメージのビルドと起動

```bash
docker compose build
docker compose up -d
```

`web`コンテナは、起動時にマイグレーションの適用と本体の起動を続けて行います。
初回のビルドには数分かかります。

進行状況やエラーは、ログで確認できます。

```bash
docker compose logs -f web
```

## 初回セットアップ

ブラウザで`url`に設定したアドレスへアクセスし、案内に従って管理者アカウントを作成します。
`.config/default.yml`に`setupPassword`を設定していた場合は、その値を入力します。

管理者アカウントの作成が完了すれば、セットアップは終わりです。

## リバースプロキシの設定

Misskeyは、HTTPS終端とWebSocketのアップグレードを行うリバースプロキシの配下での運用を前提とします。
`compose.yml`の`web`サービスはホストのポートを公開するだけなので、HTTPSの終端はホスト側のnginxなど、別のリバースプロキシで行います。
設定例は、[SETUP_SYSTEMD.md](SETUP_SYSTEMD.md#リバースプロキシの設定)を参照してください。
`proxy_pass`の宛先を、コンテナがホストに公開しているポートに合わせて読み替えてください。

## CherryPickから移行する場合

CherryPickのデータベースを引き継ぐ場合は、`web`コンテナを起動する前に、フォーク向けの事前チェックスクリプトを実行してください。

```bash
docker compose run --rm web pnpm --filter backend check-yojoart-cherrypick-migration
```

このスクリプトは読み取り専用で、対象のスキーマに対して実際のマイグレーションが失敗しないかを確認します。
チェックで問題が報告された場合は、原因を解消してから`docker compose up -d`を実行してください。
