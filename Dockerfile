FROM php:8.2-apache

# Install the exact MySQL extension your clinic app needs
RUN docker-php-ext-install mysqli && docker-php-ext-enable mysqli

# Copy your code into the web server directory
COPY . /var/www/html/

# Make Apache listen to the dynamic port Render assigns
RUN sed -i 's/80/${PORT}/g' /etc/apache2/sites-available/000-default.conf /etc/apache2/ports.conf

EXPOSE 80
