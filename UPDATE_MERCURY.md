# アップデートガイド

このガイドは、稼働中のMisskey Mercuryを新しいバージョンへ更新する手順を示します。
Mercuryは、上流Misskeyのバージョンとは別に、`package.json`の`mercuryVersion`で固有のバージョンを管理しています。
リリースごとの変更内容は[CHANGELOG_MERCURY.md](CHANGELOG_MERCURY.md)にまとめてあります。

## 更新前の確認

更新するタグを決める前に、[CHANGELOG_MERCURY.md](CHANGELOG_MERCURY.md)の対象バージョンにある「Note」の項目を確認してください。
データベースマイグレーションの追加や、APIの破壊的変更など、更新後の挙動に影響する事項はここに記載します。

マイグレーションを伴う更新では、あらかじめデータベースをバックアップしてください。
systemd環境では、次のようにダンプを取得できます。

```bash
sudo -u misskey pg_dump misskey > /path/to/backup/misskey-$(date +%Y%m%d).sql
```

Docker環境では、`db`コンテナの中で`pg_dump`を実行します。

```bash
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > /path/to/backup/misskey-$(date +%Y%m%d).sql
```

`POSTGRES_USER`と`POSTGRES_DB`は、`db`コンテナに`.config/docker.env`から渡された環境変数です。
コンテナの中で展開させるため、シングルクォートで囲んでいます。

オブジェクトストレージを使わず、添付ファイルをローカルの`files`ディレクトリに保存している場合は、このディレクトリも合わせてバックアップしてください。

## systemd環境での更新

サービスを停止してから、リポジトリを新しいタグへ進めます。

```bash
sudo systemctl stop misskey-mercury
sudo -H -u misskey bash
cd /opt/misskey-mercury
git fetch --tags
git checkout mercury-v0.3.1
```

依存パッケージを更新し、ビルドし直します。

```bash
pnpm install --frozen-lockfile
pnpm build
```

マイグレーションを適用します。

```bash
pnpm run migrate
```

シェルを抜け、サービスを再開します。

```bash
sudo systemctl start misskey-mercury
sudo systemctl status misskey-mercury
```

## Docker環境での更新

リポジトリを新しいタグへ進めてから、イメージを再ビルドします。

```bash
git fetch --tags
git checkout mercury-v0.3.1
docker compose build
```

`web`コンテナは、起動のたびにマイグレーションの適用と本体の起動を続けて行います。
イメージを再ビルドしたあとにコンテナを立て直せば、マイグレーションも自動で適用されます。

```bash
docker compose up -d
docker compose logs -f web
```

## CherryPickから移行したデータベースを更新する場合

CherryPickのデータベースを引き継いだ環境を更新する場合は、マイグレーションを適用する前に、フォーク向けの事前チェックスクリプトを実行してください。
新しいバージョンで、CherryPick由来のスキーマに対する変換が追加されることがあります。

systemd環境では次のとおりです。

```bash
pnpm --filter backend check-yojoart-cherrypick-migration
```

Docker環境では、`web`コンテナ経由で実行します。

```bash
docker compose run --rm web pnpm --filter backend check-yojoart-cherrypick-migration
```

チェックで問題が報告された場合は、原因を解消してからマイグレーションを実行してください。

## ロールバックする場合

新しいバージョンで問題が起きた場合は、更新前に取得したデータベースのバックアップへ戻したうえで、元のタグへ`git checkout`し直してください。
マイグレーションを適用した後のデータベースへ、古いバージョンのコードをそのまま向けることはできません。
スキーマが、そのバージョンが前提とする形と一致しなくなるためです。
