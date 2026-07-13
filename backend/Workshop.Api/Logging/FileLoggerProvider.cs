using System.Text;

namespace Workshop.Api.Logging;

public sealed class FileLoggerProvider : ILoggerProvider
{
    private readonly FileLogWriter _writer;

    public FileLoggerProvider(string directory)
    {
        _writer = new FileLogWriter(directory);
    }

    public ILogger CreateLogger(string categoryName) => new FileLogger(categoryName, _writer);

    public void Dispose() => _writer.Dispose();

    private sealed class FileLogger : ILogger
    {
        private readonly string _categoryName;
        private readonly FileLogWriter _writer;

        public FileLogger(string categoryName, FileLogWriter writer)
        {
            _categoryName = categoryName;
            _writer = writer;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;

        public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
                return;

            var message = formatter(state, exception);
            if (string.IsNullOrWhiteSpace(message) && exception is null)
                return;

            _writer.Write(_categoryName, logLevel, eventId, message, exception);
        }
    }

    private sealed class FileLogWriter : IDisposable
    {
        private readonly object _sync = new();
        private readonly string _directory;
        private StreamWriter? _writer;
        private DateOnly _currentDate;

        public FileLogWriter(string directory)
        {
            _directory = directory;
            Directory.CreateDirectory(_directory);
        }

        public void Write(string categoryName, LogLevel logLevel, EventId eventId, string message, Exception? exception)
        {
            var now = DateTimeOffset.Now;
            var builder = new StringBuilder();
            builder
                .Append(now.ToString("yyyy-MM-dd HH:mm:ss.fff zzz"))
                .Append(" [")
                .Append(logLevel)
                .Append("] ")
                .Append(categoryName);

            if (eventId.Id != 0 || !string.IsNullOrWhiteSpace(eventId.Name))
            {
                builder
                    .Append(" [")
                    .Append(eventId.Id);

                if (!string.IsNullOrWhiteSpace(eventId.Name))
                    builder.Append(": ").Append(eventId.Name);

                builder.Append(']');
            }

            if (!string.IsNullOrWhiteSpace(message))
                builder.Append(": ").Append(message);

            if (exception is not null)
                builder.AppendLine().Append(exception);

            lock (_sync)
            {
                var writer = GetWriter(now);
                writer.WriteLine(builder.ToString());
                writer.Flush();
            }
        }

        private StreamWriter GetWriter(DateTimeOffset now)
        {
            var date = DateOnly.FromDateTime(now.LocalDateTime);
            if (_writer is not null && _currentDate == date)
                return _writer;

            _writer?.Dispose();
            _currentDate = date;
            var path = Path.Combine(_directory, $"workshop-api-{date:yyyyMMdd}.log");
            _writer = new StreamWriter(new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
            {
                AutoFlush = true
            };
            return _writer;
        }

        public void Dispose()
        {
            lock (_sync)
            {
                _writer?.Dispose();
                _writer = null;
            }
        }
    }

    private sealed class NullScope : IDisposable
    {
        public static readonly NullScope Instance = new();

        private NullScope()
        {
        }

        public void Dispose()
        {
        }
    }
}
