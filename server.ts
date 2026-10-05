      const status = msg.startsWith('VALIDATION_ERROR') ? 422 : 400;
      return res.status(status).json({ success: false, error: { code: msg.split(':')[0] || 'PASSWORD_RESET_FAILED', message: msg } });
    }
  });

  app.post(
    '/api/auth/bootstrap',
    authRateLimiter,
    validateBody(validateLoginPayload),
    async (req: Request, res: Response) => {
      try {
        const user = await authService.bootstrapInitialAdmin({
          bootstrapSecret: String(req.headers['x-admin-bootstrap-secret'] || req.body?.bootstrapSecret || ''),
          email: String(req.body?.email || ''),
          name: String(req.body?.name || ''),
          password: String(req.body?.password || ''),
          organizationId: req.body?.organizationId ? String(req.body.organizationId) : 'org_default',
        });
        return res.status(201).json({
          success: true,
          data: user,
          message: 'Initial administrator provisioned. Remove ADMIN_BOOTSTRAP_SECRET from the environment now.',
        });
      } catch (err: any) {
        const msg = err?.message || 'Bootstrap failed';
        const status =
          msg.startsWith('BOOTSTRAP_FORBIDDEN') || msg.startsWith('BOOTSTRAP_DISABLED') ? 403 :
          msg.startsWith('BOOTSTRAP_ALREADY_COMPLETED') || msg.startsWith('BOOTSTRAP_USER_EXISTS') ? 409 :
          msg.startsWith('VALIDATION_ERROR') ? 422 :
          msg.startsWith('INACTIVE_ORGANIZATION') ? 403 : 400;
        return res.status(status).json({
          success: false,
          error: {
            code: msg.split(':')[0] || 'BOOTSTRAP_FAILED',
            message: msg,
          },
        });
      }
    }
  );

  app.post(
    '/api/auth/platform/login',
    authRateLimiter,
    validateBody(validateLoginPayload),
    async (req: Request, res: Response) => {
      try {
        const result = await authService.loginPlatform({
          email: String(req.body?.email || ''),
          password: String(req.body?.password || ''),
        });
        return res.json({ success: true, data: result });
      } catch {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_PLATFORM_CREDENTIALS',
            message: 'Invalid platform credentials.',
          },
        });
      }
    }
  );

  app.post(
    '/api/auth/login',
    authRateLimiter,
    validateBody((body) => {
      // organizationId is optional for normal sign-in. AuthService resolves the
      // user's active organization from the email when there is exactly one.
      return validateLoginPayload(body);
    }),
    async (req: Request, res: Response) => {
      try {
        const result = await authService.login(req.body);
        return res.json({
          success: true,
          data: result,
        });
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('TENANT_SELECTION_REQUIRED')) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'TENANT_SELECTION_REQUIRED',
              message: 'This account belongs to multiple organizations. Select an organization to continue.',
            },
          });
        }
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password.',
          },
        });
      }
    }
  );

  app.get('/api/auth/me', requireAuth(), (req: Request, res: Response) => {
    res.json({
      success: true,
      data: req.auth,
    });
  });

  app.post('/api/auth/logout', requireAuth(), async (req: Request, res: Response) => {
    const token = req.headers.authorization?.replace('Bearer ', '').trim();
    if (token) {
      await authService.logout(token);
    }
    res.json({