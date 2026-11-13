/** An error that should be sent to the browser with a specific HTTP status. */
final class ApiException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    final int status;

    ApiException(int status, String message) {
        super(message);
        this.status = status;
    }
}
