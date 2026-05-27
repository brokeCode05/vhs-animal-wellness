FROM php:8.2-apache

# Install mysqli extension
RUN docker-php-ext-install mysqli && docker-php-ext-enable mysqli

# Copy your code into the Apache web directory
# We are copying the contents of _backend to the root web folder
COPY _backend/ /var/www/html/

# Adjust permissions for Apache
RUN chown -R www-data:www-data /var/www/html

# Make Apache listen to the dynamic port Render assigns and enable mod_rewrite
RUN sed -i 's/80/${PORT}/g' /etc/apache2/sites-available/000-default.conf /etc/apache2/ports.conf && \
    a2enmod rewrite

EXPOSE 80
