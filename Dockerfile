FROM php:8.2-apache

# Install the MySQL extension your clinic app needs
RUN docker-php-ext-install mysqli && docker-php-ext-enable mysqli

# Copy your clinic code into the web server directory
COPY . /var/www/html/

# Adjust permissions for Apache
RUN chown -R www-data:www-data /var/www/html

# Enable rewrite module
RUN a2enmod rewrite

# Make Apache listen to the dynamic port Render assigns
RUN sed -i 's/80/${PORT}/g' /etc/apache2/sites-available/000-default.conf /etc/apache2/ports.conf

EXPOSE 80
