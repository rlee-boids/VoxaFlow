export class MockLlmProvider {
    mockResponse;
    id = "mock-llm";
    constructor(mockResponse) {
        this.mockResponse = mockResponse;
    }
    async generateObject(_request, schema) {
        return schema.parse(this.mockResponse);
    }
}
//# sourceMappingURL=mock-provider.js.map