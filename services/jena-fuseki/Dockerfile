FROM eclipse-temurin:21-jre-jammy

ARG JENA_VERSION=6.2.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --create-home --home-dir /fuseki fuseki

WORKDIR /opt
RUN curl -fsSLO "https://downloads.apache.org/jena/binaries/apache-jena-fuseki-${JENA_VERSION}.tar.gz" \
 && curl -fsSLO "https://downloads.apache.org/jena/binaries/apache-jena-fuseki-${JENA_VERSION}.tar.gz.sha512" \
 && sha512sum -c "apache-jena-fuseki-${JENA_VERSION}.tar.gz.sha512" \
 && tar -xzf "apache-jena-fuseki-${JENA_VERSION}.tar.gz" \
 && mv "apache-jena-fuseki-${JENA_VERSION}" /opt/fuseki \
 && rm "apache-jena-fuseki-${JENA_VERSION}.tar.gz" "apache-jena-fuseki-${JENA_VERSION}.tar.gz.sha512" \
 && mkdir -p /fuseki/databases /fuseki/configuration \
 && chown -R 10001:10001 /fuseki /opt/fuseki

COPY --chown=10001:10001 config.ttl /fuseki/configuration/config.ttl
COPY --chown=10001:10001 capability.rules /fuseki/configuration/capability.rules

USER 10001
EXPOSE 3030
ENV JAVA_OPTIONS="-Xms512m -Xmx2g"
ENTRYPOINT ["/opt/fuseki/fuseki-server"]
CMD ["--conf=/fuseki/configuration/config.ttl"]
