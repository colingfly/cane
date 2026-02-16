with open('railway.toml', 'w') as f:
    f.write('[build]\n')
    f.write('dockerfilePath = "Dockerfile"\n')
    f.write('[deploy]\n')
    f.write('healthcheckPath = "/api/health"\n')
    f.write('healthcheckTimeout = 600\n')
    f.write('restartPolicyType = "ON_FAILURE"\n')
    f.write('restartPolicyMaxRetries = 3\n')
