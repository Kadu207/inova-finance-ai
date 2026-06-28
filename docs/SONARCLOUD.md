# SonarCloud — passo a passo

O check **"SonarCloud Code Analysis"** vinha falhando ("The last analysis has failed")
porque o projeto usava **Automatic Analysis** (SonarCloud GitHub App), que estava
cancelando. A solução é trocar para **análise via CI** (job `sonarcloud` no
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) e **desligar** a Automatic
Analysis. O job é *gated*: sem o segredo `SONAR_TOKEN` ele só avisa e fica **verde**.

## Passo a passo (≈5 min, tudo no navegador)

### 1) Gerar o token no SonarCloud
1. Acesse https://sonarcloud.io e faça login com o GitHub.
2. Canto superior direito → avatar → **My Account** → aba **Security**.
3. Em **Generate Tokens**: nome `inova-ci`, tipo **User Token** (ou *Project Analysis Token* do projeto `Kadu207_inova-finance-ai`) → **Generate**.
4. **Copie o token agora** (não é exibido de novo).

### 2) Cadastrar o token como secret no GitHub
1. Repo no GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**:
   - **Name**: `SONAR_TOKEN`
   - **Secret**: cole o token do passo 1.
3. **Add secret**.

### 3) DESLIGAR a Automatic Analysis (crítico)
> Sem isso, o SonarCloud recusa a análise via CI ("you are running CI analysis while Automatic Analysis is enabled") e o check continua falhando.

1. SonarCloud → projeto **inova-finance-ai** → **Administration** → **Analysis Method**.
2. **Desative** "Automatic Analysis" (deixe ativado apenas "CI-based analysis" / "with GitHub Actions").

### 4) Conferir a organização
- Em [`sonar-project.properties`](../sonar-project.properties), `sonar.organization` está como `kadu207`.
- Confirme a chave real em SonarCloud → sua organização → **Administration** → **Organization Key** e ajuste se for diferente.

### 5) Validar
- Abra um PR (ou faça um push) — o job **`sonarcloud`** roda o scan e publica o resultado no PR.
- Sem `SONAR_TOKEN`, o job fica **verde** com um aviso (não quebra o CI).

## Alternativa: só silenciar (se não quiser análise agora)
Como o check **não bloqueia** merges (PRs ficam `UNSTABLE`, não `BLOCKED`), você pode
simplesmente ignorá-lo, ou removê-lo na branch protection:
**Settings → Branches → regra do `main` → Status checks** → remova "SonarCloud Code Analysis".
