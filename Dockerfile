# Multi-stage Dockerfile for Skull King Scorer
# This replaces the herokuish buildpack approach with a faster, more explicit build process.
#
# To revert to buildpacks: just delete this file and git push
#
# Why this is faster than buildpacks:
# - Uses slim Alpine Linux base (~200MB) instead of herokuish (~1GB with all runtimes)
# - Multi-stage build: build stage is discarded, only production files in final image
# - No docker commit operation needed (buildpack's 43-second bottleneck)
# - Layer caching: unchanged layers (like dependencies) skip rebuild on subsequent deploys

# ============================================================================
# STAGE 1: Build the application
# ============================================================================
# Use Node 24 on Alpine Linux (minimal Linux distribution)
# This stage will be discarded after build - only outputs are copied to final stage
FROM node:24-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first (before source code)
# This allows Docker to cache the npm install layer if package.json hasn't changed
COPY package*.json ./

# Install ALL dependencies (including devDependencies needed for build)
# Uses 'ci' for faster, reproducible installs from package-lock.json
RUN npm ci

# Copy source code
COPY . .

# Build the production bundle with Vite
# Output goes to /app/dist
RUN npm run build

# ============================================================================
# STAGE 2: Production image
# ============================================================================
# Start fresh with a new slim base - the builder stage is now discarded
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies (no devDependencies)
# This excludes vite, @vitejs/plugin-react, etc. - only installs 'serve'
RUN npm ci --omit=dev

# Copy the built application from the builder stage
# This is the only thing we need from stage 1 - the compiled dist/ folder
COPY --from=builder /app/dist ./dist

# Expose port 5000 (required for Dokku to detect web process)
EXPOSE 5000

# Start the application using the same command as before
# Uses the 'serve' package to serve the static files
CMD ["npm", "start"]

# ============================================================================
# Result: Final image contains:
# - Node.js runtime (~50MB)
# - serve package + dependencies (~42MB)
# - Your built app (~200KB)
# Total: ~250MB vs ~1.2GB with buildpacks
# ============================================================================
