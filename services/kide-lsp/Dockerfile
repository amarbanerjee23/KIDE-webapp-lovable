FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -B -ntp -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -B -ntp verify

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 --create-home kide
WORKDIR /app
COPY --from=build /workspace/target/kide-lsp-transport.jar /app/kide-lsp-transport.jar
USER 10001:10001
EXPOSE 8080 8081
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/kide-lsp-transport.jar"]
