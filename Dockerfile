FROM nginx:alpine

# アプリケーションファイルをドキュメントルートにコピー
COPY local_app /usr/share/nginx/html

# Nginx設定ファイルをコピー
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
