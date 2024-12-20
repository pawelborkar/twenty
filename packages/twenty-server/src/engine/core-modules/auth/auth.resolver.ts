import { UseFilters, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { ApiKeyTokenInput } from 'src/engine/core-modules/auth/dto/api-key-token.input';
import { AppTokenInput } from 'src/engine/core-modules/auth/dto/app-token.input';
import { AuthorizeApp } from 'src/engine/core-modules/auth/dto/authorize-app.entity';
import { AuthorizeAppInput } from 'src/engine/core-modules/auth/dto/authorize-app.input';
import { EmailPasswordResetLink } from 'src/engine/core-modules/auth/dto/email-password-reset-link.entity';
import { EmailPasswordResetLinkInput } from 'src/engine/core-modules/auth/dto/email-password-reset-link.input';
import { ExchangeAuthCode } from 'src/engine/core-modules/auth/dto/exchange-auth-code.entity';
import { ExchangeAuthCodeInput } from 'src/engine/core-modules/auth/dto/exchange-auth-code.input';
import { GenerateJwtInput } from 'src/engine/core-modules/auth/dto/generate-jwt.input';
import {
  GenerateJWTOutput,
  GenerateJWTOutputWithAuthTokens,
  GenerateJWTOutputWithSSOAUTH,
} from 'src/engine/core-modules/auth/dto/generateJWT.output';
import { InvalidatePassword } from 'src/engine/core-modules/auth/dto/invalidate-password.entity';
import { TransientToken } from 'src/engine/core-modules/auth/dto/transient-token.entity';
import { UpdatePasswordViaResetTokenInput } from 'src/engine/core-modules/auth/dto/update-password-via-reset-token.input';
import { ValidatePasswordResetToken } from 'src/engine/core-modules/auth/dto/validate-password-reset-token.entity';
import { ValidatePasswordResetTokenInput } from 'src/engine/core-modules/auth/dto/validate-password-reset-token.input';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ApiKeyService } from 'src/engine/core-modules/auth/services/api-key.service';
import { OAuthService } from 'src/engine/core-modules/auth/services/oauth.service';
import { ResetPasswordService } from 'src/engine/core-modules/auth/services/reset-password.service';
import { SwitchWorkspaceService } from 'src/engine/core-modules/auth/services/switch-workspace.service';
import { LoginTokenService } from 'src/engine/core-modules/auth/token/services/login-token.service';
import { RenewTokenService } from 'src/engine/core-modules/auth/token/services/renew-token.service';
import { TransientTokenService } from 'src/engine/core-modules/auth/token/services/transient-token.service';
import { CaptchaGuard } from 'src/engine/core-modules/captcha/captcha.guard';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { User } from 'src/engine/core-modules/user/user.entity';
import { Workspace } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

import { ChallengeInput } from './dto/challenge.input';
import { LoginToken } from './dto/login-token.entity';
import { SignUpInput } from './dto/sign-up.input';
import { ApiKeyToken, AuthTokens } from './dto/token.entity';
import { UserExists } from './dto/user-exists.entity';
import { CheckUserExistsInput } from './dto/user-exists.input';
import { Verify } from './dto/verify.entity';
import { VerifyInput } from './dto/verify.input';
import { WorkspaceInviteHashValid } from './dto/workspace-invite-hash-valid.entity';
import { WorkspaceInviteHashValidInput } from './dto/workspace-invite-hash.input';
import { AuthService } from './services/auth.service';

@Resolver()
@UseFilters(AuthGraphqlApiExceptionFilter)
export class AuthResolver {
  constructor(
    private authService: AuthService,
    private renewTokenService: RenewTokenService,
    private userService: UserService,
    private apiKeyService: ApiKeyService,
    private resetPasswordService: ResetPasswordService,
    private loginTokenService: LoginTokenService,
    private switchWorkspaceService: SwitchWorkspaceService,
    private transientTokenService: TransientTokenService,
    private oauthService: OAuthService,
  ) {}

  @UseGuards(CaptchaGuard)
  @Query(() => UserExists)
  async checkUserExists(
    @Args() checkUserExistsInput: CheckUserExistsInput,
  ): Promise<UserExists> {
    const { exists } = await this.authService.checkUserExists(
      checkUserExistsInput.email,
    );

    return { exists };
  }

  @Query(() => WorkspaceInviteHashValid)
  async checkWorkspaceInviteHashIsValid(
    @Args() workspaceInviteHashValidInput: WorkspaceInviteHashValidInput,
  ): Promise<WorkspaceInviteHashValid> {
    return await this.authService.checkWorkspaceInviteHashIsValid(
      workspaceInviteHashValidInput.inviteHash,
    );
  }

  @Query(() => Workspace)
  async findWorkspaceFromInviteHash(
    @Args() workspaceInviteHashValidInput: WorkspaceInviteHashValidInput,
  ): Promise<Workspace> {
    return await this.authService.findWorkspaceFromInviteHashOrFail(
      workspaceInviteHashValidInput.inviteHash,
    );
  }

  @UseGuards(CaptchaGuard)
  @Mutation(() => LoginToken)
  async challenge(@Args() challengeInput: ChallengeInput): Promise<LoginToken> {
    const user = await this.authService.challenge(challengeInput);
    const loginToken = await this.loginTokenService.generateLoginToken(
      user.email,
    );

    return { loginToken };
  }

  @UseGuards(CaptchaGuard)
  @Mutation(() => LoginToken)
  async signUp(@Args() signUpInput: SignUpInput): Promise<LoginToken> {
    const user = await this.authService.signInUp({
      ...signUpInput,
      fromSSO: false,
    });

    const loginToken = await this.loginTokenService.generateLoginToken(
      user.email,
    );

    return { loginToken };
  }

  @Mutation(() => ExchangeAuthCode)
  async exchangeAuthorizationCode(
    @Args() exchangeAuthCodeInput: ExchangeAuthCodeInput,
  ) {
    const tokens = await this.oauthService.verifyAuthorizationCode(
      exchangeAuthCodeInput,
    );

    return tokens;
  }

  @Mutation(() => TransientToken)
  @UseGuards(WorkspaceAuthGuard, UserAuthGuard)
  async generateTransientToken(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<TransientToken | void> {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return;
    }
    const transientToken =
      await this.transientTokenService.generateTransientToken(
        workspaceMember.id,
        user.id,
        user.defaultWorkspaceId,
      );

    return { transientToken };
  }

  @Mutation(() => Verify)
  async verify(@Args() verifyInput: VerifyInput): Promise<Verify> {
    const email = await this.loginTokenService.verifyLoginToken(
      verifyInput.loginToken,
    );

    const result = await this.authService.verify(email);

    return result;
  }

  @Mutation(() => AuthorizeApp)
  @UseGuards(WorkspaceAuthGuard, UserAuthGuard)
  async authorizeApp(
    @Args() authorizeAppInput: AuthorizeAppInput,
    @AuthUser() user: User,
  ): Promise<AuthorizeApp> {
    const authorizedApp = await this.authService.generateAuthorizationCode(
      authorizeAppInput,
      user,
    );

    return authorizedApp;
  }

  @Mutation(() => GenerateJWTOutput)
  @UseGuards(WorkspaceAuthGuard, UserAuthGuard)
  async generateJWT(
    @AuthUser() user: User,
    @Args() args: GenerateJwtInput,
  ): Promise<GenerateJWTOutputWithAuthTokens | GenerateJWTOutputWithSSOAUTH> {
    const result = await this.switchWorkspaceService.switchWorkspace(
      user,
      args.workspaceId,
    );

    if (result.useSSOAuth) {
      return {
        success: true,
        reason: 'WORKSPACE_USE_SSO_AUTH',
        availableSSOIDPs: result.availableSSOIdentityProviders.map(
          (identityProvider) => ({
            ...identityProvider,
            workspace: {
              id: result.workspace.id,
              displayName: result.workspace.displayName,
            },
          }),
        ),
      };
    }

    return {
      success: true,
      reason: 'WORKSPACE_AVAILABLE_FOR_SWITCH',
      authTokens:
        await this.switchWorkspaceService.generateSwitchWorkspaceToken(
          user,
          result.workspace,
        ),
    };
  }

  @Mutation(() => AuthTokens)
  async renewToken(@Args() args: AppTokenInput): Promise<AuthTokens> {
    const tokens = await this.renewTokenService.generateTokensFromRefreshToken(
      args.appToken,
    );

    return { tokens: tokens };
  }

  @UseGuards(WorkspaceAuthGuard)
  @Mutation(() => ApiKeyToken)
  async generateApiKeyToken(
    @Args() args: ApiKeyTokenInput,
    @AuthWorkspace() { id: workspaceId }: Workspace,
  ): Promise<ApiKeyToken | undefined> {
    return await this.apiKeyService.generateApiKeyToken(
      workspaceId,
      args.apiKeyId,
      args.expiresAt,
    );
  }

  @Mutation(() => EmailPasswordResetLink)
  async emailPasswordResetLink(
    @Args() emailPasswordResetInput: EmailPasswordResetLinkInput,
  ): Promise<EmailPasswordResetLink> {
    const resetToken =
      await this.resetPasswordService.generatePasswordResetToken(
        emailPasswordResetInput.email,
      );

    return await this.resetPasswordService.sendEmailPasswordResetLink(
      resetToken,
      emailPasswordResetInput.email,
    );
  }

  @Mutation(() => InvalidatePassword)
  async updatePasswordViaResetToken(
    @Args()
    { passwordResetToken, newPassword }: UpdatePasswordViaResetTokenInput,
  ): Promise<InvalidatePassword> {
    const { id } =
      await this.resetPasswordService.validatePasswordResetToken(
        passwordResetToken,
      );

    await this.authService.updatePassword(id, newPassword);

    return await this.resetPasswordService.invalidatePasswordResetToken(id);
  }

  @Query(() => ValidatePasswordResetToken)
  async validatePasswordResetToken(
    @Args() args: ValidatePasswordResetTokenInput,
  ): Promise<ValidatePasswordResetToken> {
    return this.resetPasswordService.validatePasswordResetToken(
      args.passwordResetToken,
    );
  }
}
