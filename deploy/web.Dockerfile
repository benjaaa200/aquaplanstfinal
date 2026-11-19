FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html /usr/share/nginx/html/index.html
COPY admin.html /usr/share/nginx/html/admin.html
COPY encargado.html /usr/share/nginx/html/encargado.html
COPY supervisor.html /usr/share/nginx/html/supervisor.html
COPY credentials-helper.html /usr/share/nginx/html/credentials-helper.html

COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY pages/ /usr/share/nginx/html/pages/
COPY admin/ /usr/share/nginx/html/admin/
COPY assets/ /usr/share/nginx/html/assets/
COPY simulador/ /usr/share/nginx/html/simulador/

EXPOSE 80
