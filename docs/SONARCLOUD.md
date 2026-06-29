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

> ⚠️ **PROJETO CERTO — a pegadinha que já custou horas.** A org `kadu207` tem MAIS DE UM
> projeto (confirmado: `Kadu207_inova-finance-ai` **e** `Kadu207_saas-acme-erp-financeiro`,
> entre outros). Desligar o Automatic Analysis no projeto errado **NÃO tem efeito** sobre o
> CI. O CI analisa **a key de [`sonar-project.properties`](../sonar-project.properties) →
> `sonar.projectKey`**, hoje **`Kadu207_inova-finance-ai`**. Antes de desligar, confirme que
> você está NESSE projeto: olhe o `id=` na URL, ou **Administration → Project Information → Key**.

1. Vá direto à página certa: **https://sonarcloud.io/project/analysis_method?id=Kadu207_inova-finance-ai**
   (ou: org `kadu207` → abra o projeto cuja **Key** é `Kadu207_inova-finance-ai` → **Administration → Analysis Method**).
2. **Desative** "Automatic Analysis" (deixe só "CI-based analysis" / "with GitHub Actions"). **Salve.**
3. Recarregue e confirme que ficou **Off** nesse projeto específico.

### 4) Conferir a organização
- Em [`sonar-project.properties`](../sonar-project.properties), `sonar.organization` está como `kadu207`.
- Confirme a chave real em SonarCloud → sua organização → **Administration** → **Organization Key** e ajuste se for diferente.

### 5) Validar
- Abra um PR (ou faça um push) — o job **`sonarcloud`** roda o scan e publica o resultado no PR.
- Sem `SONAR_TOKEN`, o job fica **verde** com um aviso (não quebra o CI).

### 6) Depois que o gate ficar verde (tornar bloqueante)
Quando o job `sonarcloud` rodar limpo em 1–2 PRs, dá para deixar o Sonar bloquear merge:
1. Remover o `continue-on-error` do step "SonarCloud Scan" em [`ci.yml`](../.github/workflows/ci.yml).
2. Adicionar os checks à branch protection da `main`:
   ```bash
   gh api -X POST repos/Kadu207/inova-finance-ai/branches/main/protection/required_status_checks/contexts \
     --input - <<'JSON'
   ["sonarcloud", "SonarCloud Code Analysis"]
   JSON
   ```

## Troubleshooting

**`ERROR You are running CI analysis while Automatic Analysis is enabled` (exit 3)** — o
Automatic Analysis ainda está LIGADO no projeto que o CI alimenta. 99% das vezes é o erro
de **projeto errado** (ver o aviso do passo 3): você desligou em `saas-acme-erp-financeiro`,
mas o CI usa `Kadu207_inova-finance-ai`. Desligue no projeto cuja Key == `sonar.projectKey`.

**Por que isto pode travar TODOS os merges** — se os checks `sonarcloud` /
`SonarCloud Code Analysis` forem obrigatórios na `main` (passo 6) enquanto o scan falha,
eles ficam vermelhos em todo PR e o GitHub bloqueia o merge. Por isso só torne bloqueante
DEPOIS de ver o gate verde de forma consistente.

## Alternativa: só silenciar (se não quiser análise agora)
Enquanto não estiver nos checks obrigatórios, o Sonar **não bloqueia** merges. Você pode
ignorá-lo, ou (se já estiver obrigatório) removê-lo:
```bash
# remover só os checks do Sonar da lista de obrigatórios:
gh api repos/Kadu207/inova-finance-ai/branches/main/protection/required_status_checks/contexts \
  -X PUT --input - <<'JSON'
["rls-isolation", "lint-typecheck", "test-js", "test-python", "contract-tests", "wrangler-dry-run"]
JSON
```
