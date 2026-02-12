# ================= build =================
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# copy csproj for cache
COPY Workshop.Api/Workshop.Api.csproj Workshop.Api/
COPY CarjamImporter/CarjamImporter.csproj CarjamImporter/
RUN dotnet restore Workshop.Api/Workshop.Api.csproj

# copy full source
COPY . ./

# publish API (includes referenced CarjamImporter)
RUN dotnet publish Workshop.Api/Workshop.Api.csproj -c Release -o /app/publish /p:UseAppHost=false


# ================= runtime (Playwright 官方镜像) =================
FROM mcr.microsoft.com/playwright/dotnet:v1.57.0-jammy AS final
WORKDIR /app

# 官方镜像已内置 Chromium + 所有依赖
COPY --from=build /app/publish ./

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Workshop.Api.dll"]
