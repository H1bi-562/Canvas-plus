import { Eye, EyeOff } from 'lucide-react';

interface LoginPageProps {
  darkMode: boolean;
  isLogin: boolean;
  setIsLogin: (value: boolean) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  onBackToApp: () => void;
}

export default function LoginPage({
  darkMode,
  isLogin,
  setIsLogin,
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  showPassword,
  setShowPassword,
  onBackToApp
}: LoginPageProps) {
  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center px-4 py-6">
      <div className={`w-full max-w-md rounded-lg shadow-lg p-8 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-gray-300">
          <button
            onClick={() => setIsLogin(true)}
            className={`pb-2 px-4 font-semibold transition-colors ${
              isLogin
                ? `border-b-2 border-blue-600 ${darkMode ? 'text-white' : 'text-blue-600'}`
                : `${darkMode ? 'text-gray-400' : 'text-gray-500'}`
            }`}
          >
            Log In
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`pb-2 px-4 font-semibold transition-colors ${
              !isLogin
                ? `border-b-2 border-blue-600 ${darkMode ? 'text-white' : 'text-blue-600'}`
                : `${darkMode ? 'text-gray-400' : 'text-gray-500'}`
            }`}
          >
            Sign Up
          </button>
        </div>

        <h2 className={`text-2xl font-semibold mb-6 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          {isLogin ? 'Welcome Back!' : 'Create Your Account'}
        </h2>

        {/* Form */}
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          {/* Email */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                darkMode ? 'bg-[#2d2d2d] border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'
              }`}
            />
          </div>

          {/* Password */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 ${
                  darkMode ? 'bg-[#2d2d2d] border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Confirm Password (Sign Up only) */}
          {!isLogin && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  darkMode ? 'bg-[#2d2d2d] border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg transition-colors font-semibold mt-6"
          >
            {isLogin ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        {/* Forgot Password (Login only) */}
        {isLogin && (
          <div className="mt-4 text-center">
            <button className="text-sm text-blue-600 hover:text-blue-700 transition-colors">
              Forgot Password?
            </button>
          </div>
        )}

        {/* Back to App Button */}
        <div className="mt-6 text-center">
          <button
            onClick={onBackToApp}
            className={`text-sm hover:underline ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}
          >
            Back to App
          </button>
        </div>
      </div>
    </div>
  );
}
